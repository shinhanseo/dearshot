import { createHash, randomBytes } from "node:crypto";
import { constants, createReadStream } from "node:fs";
import { mkdir, open, rename, rm } from "node:fs/promises";
import path from "node:path";
import { Transform, Writable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { Request } from "express";
import busboy from "busboy";
import sharp from "sharp";
import { ApiError } from "../http/api-error.js";

export type UploadPurpose = "SCENE_ANALYSIS" | "PHOTO_FEEDBACK";
export type SupportedImageContentType = "image/jpeg" | "image/webp";

export type ImageStorageConfig = {
  root: string;
  maxBytes: number;
  maxDimensionPixels: number;
  maxPixels: number;
};

export type StoredImage = {
  storagePath: string;
  contentType: SupportedImageContentType;
  byteSize: number;
  sha256: string;
  width: number;
  height: number;
};

export type AcceptedImageUpload = {
  purpose: UploadPurpose;
  image: StoredImage;
};

type FileOutcome =
  | { ok: true; image: StoredImage }
  | { ok: false; error: unknown };

type QuarantinedFile = {
  discard: () => Promise<void>;
  restore: () => Promise<void>;
};

const purposes = new Set<UploadPurpose>(["SCENE_ANALYSIS", "PHOTO_FEEDBACK"]);
const contentTypes = new Set<SupportedImageContentType>(["image/jpeg", "image/webp"]);

export class ImageStorage {
  private readonly root: string;
  private readonly stagingRoot: string;
  private readonly objectRoot: string;
  private readonly trashRoot: string;
  private readonly initialized: Promise<void>;

  constructor(private readonly config: ImageStorageConfig) {
    this.root = path.resolve(config.root);
    this.stagingRoot = path.join(this.root, ".staging");
    this.objectRoot = path.join(this.root, "objects");
    this.trashRoot = path.join(this.root, ".trash");
    this.initialized = this.initialize();
  }

  async ready(): Promise<void> {
    await this.initialized;
  }

  async acceptMultipart(request: Request): Promise<AcceptedImageUpload> {
    let parser: ReturnType<typeof busboy>;
    try {
      parser = busboy({
        headers: request.headers,
        preservePath: false,
        limits: {
          fieldNameSize: 64,
          fieldSize: 64,
          // Busboy emits each limit event when the counter reaches the configured
          // value, so these are one above the valid contract (1 field + 1 file).
          fields: 2,
          files: 2,
          parts: 3,
          fileSize: this.config.maxBytes,
          headerPairs: 32,
        },
      });
    } catch (cause) {
      throw this.invalidMultipart(cause);
    }

    let purpose: UploadPurpose | undefined;
    let fileOutcome: Promise<FileOutcome> | undefined;
    let validationError: ApiError | undefined;
    const rejectOnce = (error: ApiError) => {
      validationError ??= error;
    };

    parser.on("field", (name, value, info) => {
      if (name !== "purpose" || purpose || info.nameTruncated || info.valueTruncated) {
        rejectOnce(this.invalidMultipart());
        return;
      }
      if (!purposes.has(value as UploadPurpose)) {
        rejectOnce(
          new ApiError({
            statusCode: 400,
            code: "INVALID_PURPOSE",
            message: "Upload purpose is invalid",
          }),
        );
        return;
      }
      purpose = value as UploadPurpose;
    });

    parser.on("file", (name, stream, info) => {
      if (name !== "image" || fileOutcome) {
        rejectOnce(this.invalidMultipart());
        stream.resume();
        return;
      }
      if (!contentTypes.has(info.mimeType as SupportedImageContentType)) {
        rejectOnce(
          new ApiError({
            statusCode: 415,
            code: "UNSUPPORTED_MEDIA_TYPE",
            message: "Only JPEG and WebP images are supported",
          }),
        );
        stream.resume();
        return;
      }
      fileOutcome = this.storeStream(
        stream,
        info.mimeType as SupportedImageContentType,
      ).then(
        (image) => ({ ok: true as const, image }),
        (error: unknown) => ({ ok: false as const, error }),
      );
    });

    const limitError = () => rejectOnce(this.invalidMultipart());
    parser.on("fieldsLimit", limitError);
    parser.on("filesLimit", limitError);
    parser.on("partsLimit", limitError);

    const requestLimit = this.config.maxBytes + 64 * 1_024;
    let requestBytes = 0;
    const requestLimiter = new Transform({
      transform: (chunk: Buffer, _encoding, callback) => {
        requestBytes += chunk.length;
        if (requestBytes > requestLimit) {
          callback(this.imageTooLarge());
          return;
        }
        callback(null, chunk);
      },
    });

    const parsingError = await new Promise<unknown | undefined>((resolve) => {
      let settled = false;
      const settle = (error?: unknown) => {
        if (settled) return;
        settled = true;
        resolve(error);
      };
      requestLimiter.once("error", (error) => {
        request.unpipe(requestLimiter);
        request.resume();
        parser.destroy(error);
        settle(error);
      });
      parser.once("error", settle);
      parser.once("close", () => settle());
      request.once("aborted", () => {
        const error = new Error("Upload request was aborted");
        parser.destroy(error);
        settle(error);
      });
      request.once("error", settle);
      request.pipe(requestLimiter).pipe(parser);
    });

    const outcome = fileOutcome ? await fileOutcome : undefined;
    if (parsingError) {
      validationError ??= parsingError instanceof ApiError
        ? parsingError
        : this.invalidMultipart(parsingError);
    }
    if (outcome && !outcome.ok) {
      if (outcome.error instanceof ApiError) validationError ??= outcome.error;
      else validationError ??= this.invalidImage(outcome.error);
    }

    if (validationError || !purpose || !outcome?.ok) {
      if (outcome?.ok) await this.remove(outcome.image.storagePath);
      throw validationError ?? this.invalidMultipart();
    }

    return { purpose, image: outcome.image };
  }

  async remove(storagePath: string): Promise<void> {
    await this.initialized;
    const absolutePath = this.resolveStoredPath(storagePath);
    await rm(absolutePath, { force: true });
  }

  async quarantine(storagePath: string): Promise<QuarantinedFile> {
    await this.initialized;
    const source = this.resolveStoredPath(storagePath);
    const trash = path.join(this.trashRoot, `${randomBytes(24).toString("hex")}.deleted`);
    let moved = false;
    try {
      await rename(source, trash);
      moved = true;
      await this.syncDirectory(path.dirname(source));
      await this.syncDirectory(this.trashRoot);
    } catch (error) {
      if (!this.isMissingFile(error)) throw error;
    }

    return {
      discard: async () => {
        if (moved) await rm(trash, { force: true });
      },
      restore: async () => {
        if (!moved) return;
        await mkdir(path.dirname(source), { recursive: true, mode: 0o700 });
        await rename(trash, source);
        moved = false;
      },
    };
  }

  private async initialize() {
    await Promise.all(
      [this.root, this.stagingRoot, this.objectRoot, this.trashRoot].map((directory) =>
        mkdir(directory, { recursive: true, mode: 0o700 }),
      ),
    );
  }

  private async storeStream(
    stream: NodeJS.ReadableStream & { truncated?: boolean },
    declaredContentType: SupportedImageContentType,
  ): Promise<StoredImage> {
    await this.initialized;
    const randomName = randomBytes(24).toString("hex");
    const stagingPath = path.join(this.stagingRoot, `${randomName}.part`);
    let finalStoragePath: string | undefined;
    let fileHandle: Awaited<ReturnType<typeof open>> | undefined;

    try {
      fileHandle = await open(stagingPath, "wx", 0o600);
      const hash = createHash("sha256");
      const signature = Buffer.alloc(12);
      let signatureBytes = 0;
      let byteSize = 0;

      for await (const value of stream) {
        const chunk = Buffer.isBuffer(value)
          ? value
          : typeof value === "string"
            ? Buffer.from(value)
            : Buffer.from(value as Uint8Array);
        byteSize += chunk.length;
        if (byteSize > this.config.maxBytes) throw this.imageTooLarge();
        hash.update(chunk);
        if (signatureBytes < signature.length) {
          const copied = chunk.copy(
            signature,
            signatureBytes,
            0,
            Math.min(chunk.length, signature.length - signatureBytes),
          );
          signatureBytes += copied;
        }
        await fileHandle.write(chunk);
      }

      if (stream.truncated || byteSize > this.config.maxBytes) throw this.imageTooLarge();
      if (byteSize === 0) throw this.invalidImage();
      await fileHandle.sync();
      await fileHandle.close();
      fileHandle = undefined;

      const signatureContentType = this.detectSignature(signature.subarray(0, signatureBytes));
      if (!signatureContentType || signatureContentType !== declaredContentType) {
        throw this.invalidImage();
      }

      let metadata: Awaited<ReturnType<ReturnType<typeof sharp>["metadata"]>>;
      try {
        metadata = await sharp(stagingPath, {
          failOn: "error",
          limitInputPixels: this.config.maxPixels,
          sequentialRead: true,
        }).metadata();
      } catch (cause) {
        const message = cause instanceof Error ? cause.message : "";
        if (/pixel limit|image dimensions exceed/i.test(message)) {
          throw this.unsupportedDimensions(cause);
        }
        throw this.invalidImage(cause);
      }

      const actualContentType = metadata.format === "jpeg"
        ? "image/jpeg"
        : metadata.format === "webp"
          ? "image/webp"
          : undefined;
      if (
        actualContentType !== declaredContentType ||
        !metadata.width ||
        !metadata.height ||
        (metadata.pages ?? 1) !== 1
      ) {
        throw this.invalidImage();
      }
      if (
        metadata.width > this.config.maxDimensionPixels ||
        metadata.height > this.config.maxDimensionPixels ||
        metadata.width * metadata.height > this.config.maxPixels
      ) {
        throw this.unsupportedDimensions();
      }
      await this.decodeEntireImage(stagingPath);

      const extension = actualContentType === "image/jpeg" ? "jpg" : "webp";
      const shard = randomName.slice(0, 2);
      const relativePath = path.posix.join("objects", shard, `${randomName}.${extension}`);
      const finalPath = this.resolveStoredPath(relativePath);
      await mkdir(path.dirname(finalPath), { recursive: true, mode: 0o700 });
      await rename(stagingPath, finalPath);
      finalStoragePath = relativePath;
      await this.syncDirectory(path.dirname(finalPath));

      return {
        storagePath: relativePath,
        contentType: actualContentType,
        byteSize,
        sha256: hash.digest("hex"),
        width: metadata.width,
        height: metadata.height,
      };
    } catch (error) {
      if (fileHandle) await fileHandle.close().catch(() => undefined);
      await rm(stagingPath, { force: true }).catch(() => undefined);
      if (finalStoragePath) await this.remove(finalStoragePath).catch(() => undefined);
      throw error;
    }
  }

  private resolveStoredPath(storagePath: string): string {
    if (path.isAbsolute(storagePath)) throw new Error("Stored upload path must be relative");
    const resolved = path.resolve(this.root, storagePath);
    if (!resolved.startsWith(`${this.root}${path.sep}`)) {
      throw new Error("Stored upload path escaped the upload root");
    }
    return resolved;
  }

  private detectSignature(bytes: Buffer): SupportedImageContentType | undefined {
    if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
      return "image/jpeg";
    }
    if (
      bytes.length >= 12 &&
      bytes.subarray(0, 4).toString("ascii") === "RIFF" &&
      bytes.subarray(8, 12).toString("ascii") === "WEBP"
    ) {
      return "image/webp";
    }
    return undefined;
  }

  private async syncDirectory(directory: string): Promise<void> {
    const handle = await open(directory, constants.O_RDONLY);
    try {
      await handle.sync();
    } finally {
      await handle.close();
    }
  }

  private async decodeEntireImage(filePath: string): Promise<void> {
    try {
      await pipeline(
        createReadStream(filePath),
        sharp({
          failOn: "error",
          limitInputPixels: this.config.maxPixels,
          sequentialRead: true,
        }).raw(),
        new Writable({ write: (_chunk, _encoding, callback) => callback() }),
      );
    } catch (cause) {
      throw this.invalidImage(cause);
    }
  }

  private isMissingFile(error: unknown): boolean {
    return error instanceof Error && "code" in error && error.code === "ENOENT";
  }

  private invalidMultipart(cause?: unknown) {
    return new ApiError({
      statusCode: 400,
      code: "INVALID_MULTIPART",
      message: "Upload must contain one purpose field and one image file",
      cause,
    });
  }

  private imageTooLarge() {
    return new ApiError({
      statusCode: 413,
      code: "IMAGE_TOO_LARGE",
      message: "Image exceeds the upload size limit",
    });
  }

  private invalidImage(cause?: unknown) {
    return new ApiError({
      statusCode: 422,
      code: "INVALID_IMAGE",
      message: "Image data is invalid or does not match its content type",
      cause,
    });
  }

  private unsupportedDimensions(cause?: unknown) {
    return new ApiError({
      statusCode: 422,
      code: "IMAGE_DIMENSIONS_UNSUPPORTED",
      message: "Image dimensions exceed the supported limit",
      cause,
    });
  }
}
