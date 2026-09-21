import { randomUUID } from "node:crypto";
import { and, eq, gt, isNull } from "drizzle-orm";
import type { AccessPrincipal } from "../auth/token-service.js";
import type { Database } from "../db/client.js";
import { refreshSessions, users } from "../db/schema/identity.js";
import { imageUploads } from "../db/schema/jobs.js";
import { ApiError } from "../http/api-error.js";
import type { ImageStorage, StoredImage, UploadPurpose } from "./image-storage.js";

export type UploadServiceConfig = { ttlSeconds: number };

export class UploadService {
  constructor(
    private readonly database: Database,
    private readonly storage: ImageStorage,
    private readonly config: UploadServiceConfig,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async resolveActivePrincipal(principal: AccessPrincipal): Promise<string> {
    const now = this.clock();
    const [active] = await this.database
      .select({ accountType: users.accountType, status: users.status })
      .from(users)
      .innerJoin(
        refreshSessions,
        and(
          eq(refreshSessions.id, principal.sid),
          eq(refreshSessions.userId, users.id),
          isNull(refreshSessions.revokedAt),
          gt(refreshSessions.expiresAt, now),
        ),
      )
      .where(eq(users.id, principal.sub))
      .limit(1);

    if (
      !active ||
      active.status !== "ACTIVE" ||
      active.accountType !== principal.principalType
    ) {
      throw new ApiError({
        statusCode: 401,
        code: "INVALID_TOKEN",
        message: "User session is no longer active",
      });
    }
    return principal.sub;
  }

  async createReady(ownerUserId: string, purpose: UploadPurpose, image: StoredImage) {
    const id = randomUUID();
    const expiresAt = new Date(this.clock().getTime() + this.config.ttlSeconds * 1_000);
    try {
      const [created] = await this.database
        .insert(imageUploads)
        .values({
          id,
          ownerUserId,
          purpose,
          storagePath: image.storagePath,
          contentType: image.contentType,
          byteSize: image.byteSize,
          sha256: image.sha256,
          width: image.width,
          height: image.height,
          expiresAt,
        })
        .returning({
          uploadId: imageUploads.id,
          status: imageUploads.status,
          purpose: imageUploads.purpose,
          contentType: imageUploads.contentType,
          byteSize: imageUploads.byteSize,
          width: imageUploads.width,
          height: imageUploads.height,
          expiresAt: imageUploads.expiresAt,
        });
      return created;
    } catch (error) {
      await this.storage.remove(image.storagePath).catch(() => undefined);
      throw error;
    }
  }

  async delete(principal: AccessPrincipal, uploadId: string): Promise<void> {
    const ownerUserId = await this.resolveActivePrincipal(principal);
    let quarantine: Awaited<ReturnType<ImageStorage["quarantine"]>> | undefined;
    let deleted = false;
    try {
      deleted = await this.database.transaction(async (transaction) => {
        const [upload] = await transaction
          .select({
            ownerUserId: imageUploads.ownerUserId,
            status: imageUploads.status,
            storagePath: imageUploads.storagePath,
          })
          .from(imageUploads)
          .where(eq(imageUploads.id, uploadId))
          .limit(1)
          .for("update");

        if (!upload || upload.ownerUserId !== ownerUserId) {
          throw new ApiError({
            statusCode: 404,
            code: "RESOURCE_NOT_FOUND",
            message: "Upload was not found",
          });
        }
        if (upload.status === "CONSUMED") {
          throw new ApiError({
            statusCode: 409,
            code: "UPLOAD_ALREADY_USED",
            message: "Consumed uploads cannot be deleted",
          });
        }
        if (upload.status === "DELETED" || upload.status === "EXPIRED") return false;

        quarantine = await this.storage.quarantine(upload.storagePath);
        await transaction
          .update(imageUploads)
          .set({ status: "DELETED", deletedAt: this.clock() })
          .where(eq(imageUploads.id, uploadId));
        return true;
      });
    } catch (error) {
      await quarantine?.restore().catch(() => undefined);
      throw error;
    }
    if (deleted) await quarantine?.discard();
  }
}
