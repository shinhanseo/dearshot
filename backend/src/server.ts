import "dotenv/config";
import { createApp } from "./app.js";
import { AuthService } from "./auth/auth-service.js";
import { GoogleAuthLibraryVerifier } from "./auth/google/google-identity-verifier.js";
import { GoogleAuthService } from "./auth/google/google-auth-service.js";
import { KakaoAuthService } from "./auth/kakao/kakao-auth-service.js";
import { KakaoApiIdentityVerifier } from "./auth/kakao/kakao-identity-verifier.js";
import { SocialIdentityAuthService } from "./auth/social-identity-auth-service.js";
import { TokenService } from "./auth/token-service.js";
import { CatalogService } from "./catalog/catalog-service.js";
import { TemplateInteractionService } from "./catalog/template-interaction-service.js";
import { loadEnvironment } from "./config/environment.js";
import {
  closeDatabaseConnection,
  createDatabaseConnection,
  verifyDatabaseConnection,
} from "./db/client.js";
import { createLogger } from "./observability/logger.js";
import { IdempotencyService } from "./reliability/idempotency-service.js";
import { createIpRateLimiter } from "./reliability/ip-rate-limiter.js";
import { AppEventService } from "./product-events/app-event-service.js";
import { ImageStorage } from "./uploads/image-storage.js";
import { UploadService } from "./uploads/upload-service.js";
import { UsageLimitService } from "./reliability/usage-limit-service.js";
import { SceneAnalysisService } from "./scene-analysis/scene-analysis-service.js";
import { SceneAnalysisWorker } from "./scene-analysis/scene-analysis-worker.js";
import { GeminiSceneRecommendationProvider } from "./scene-analysis/gemini-scene-recommendation-provider.js";
import { SceneRecommendationProcessor } from "./scene-analysis/scene-recommendation-processor.js";
import { MockSceneRecommendationProvider } from "./scene-analysis/scene-recommendation-provider.js";
import { SceneTemplateCandidateService } from "./scene-analysis/scene-template-candidate-service.js";
import { PhotoFeedbackService } from "./photo-feedback/photo-feedback-service.js";
import { PhotoFeedbackWorker } from "./photo-feedback/photo-feedback-worker.js";
import { ProviderPhotoFeedbackProcessor } from "./photo-feedback/photo-feedback-processor.js";
import { GeminiPhotoFeedbackProvider } from "./photo-feedback/gemini-photo-feedback-provider.js";
import { MockPhotoFeedbackProvider } from "./photo-feedback/photo-feedback-provider.js";
import { AccountService } from "./account/account-service.js";
import { AccountDeletionWorker } from "./account/account-deletion-worker.js";
import { RetentionWorker } from "./privacy/retention-worker.js";

async function main() {
  const environment = loadEnvironment();
  const logger = createLogger({ level: environment.logLevel });
  const database = createDatabaseConnection(environment.database, logger);
  const tokenService = new TokenService(environment.auth);
  const googleVerifier = new GoogleAuthLibraryVerifier(environment.google.webClientId);
  const authService = new AuthService(database.db, tokenService, environment.auth);
  const accountService = new AccountService(
    database.db,
    environment.privacy.deletionStatusRetentionDays,
  );
  const socialIdentityAuthService = new SocialIdentityAuthService(
    database.db,
    tokenService,
    environment.auth,
    environment.privacy.deletionStatusRetentionDays,
  );
  const googleAuthService = new GoogleAuthService(googleVerifier, socialIdentityAuthService);
  const kakaoVerifier = new KakaoApiIdentityVerifier(
    environment.kakao.appId,
    environment.kakao.apiTimeoutMillis,
  );
  const kakaoAuthService = new KakaoAuthService(kakaoVerifier, socialIdentityAuthService);
  const catalogService = new CatalogService(database.db, environment.catalog.assetBaseUrl);
  const templateInteractionService = new TemplateInteractionService(database.db);
  const imageStorage = new ImageStorage(environment.uploads);
  const idempotencyService = new IdempotencyService(
    database.db,
    environment.idempotency.ttlSeconds,
  );
  const uploadService = new UploadService(
    database.db,
    imageStorage,
    environment.uploads,
    idempotencyService,
  );
  const usageLimitService = new UsageLimitService(database.db, environment.usage);
  const sceneAnalysisService = new SceneAnalysisService(
    database.db,
    uploadService,
    idempotencyService,
    usageLimitService,
    {
      retentionDays: environment.sceneAnalysis.retentionDays,
      maxAttempts: environment.sceneAnalysis.workerMaxAttempts,
      pollAfterMillis: environment.sceneAnalysis.pollAfterMillis,
    },
  );
  const recommendationProvider = environment.ai.provider === "gemini"
    ? new GeminiSceneRecommendationProvider({
      apiKey: environment.ai.apiKey,
      model: environment.ai.gemini.sceneModel,
      timeoutMillis: environment.ai.gemini.timeoutMillis,
      maximumResponseBytes: environment.ai.gemini.maximumResponseBytes,
    })
    : new MockSceneRecommendationProvider();
  const sceneTemplateCandidates = new SceneTemplateCandidateService(
    database.db,
    environment.sceneAnalysis.maximumCandidates,
  );
  const sceneRecommendationProcessor = new SceneRecommendationProcessor(
    database.db,
    imageStorage,
    sceneTemplateCandidates,
    recommendationProvider,
    { minimumConfidence: environment.sceneAnalysis.minimumConfidence },
  );
  const sceneAnalysisWorker = new SceneAnalysisWorker(
    database.db,
    sceneRecommendationProcessor,
    {
      pollIntervalMillis: environment.sceneAnalysis.workerPollIntervalMillis,
      leaseSeconds: environment.sceneAnalysis.workerLeaseSeconds,
      retryBaseSeconds: environment.sceneAnalysis.workerRetryBaseSeconds,
      onTerminal: ({ uploadId, storagePath }) =>
        uploadService.purgeConsumed(uploadId, storagePath),
    },
    logger,
  );
  const photoFeedbackService = new PhotoFeedbackService(
    database.db,
    uploadService,
    idempotencyService,
    usageLimitService,
    {
      retentionDays: environment.photoFeedback.retentionDays,
      maxAttempts: environment.sceneAnalysis.workerMaxAttempts,
      pollAfterMillis: environment.photoFeedback.pollAfterMillis,
    },
  );
  const photoFeedbackProvider = environment.ai.provider === "gemini"
    ? new GeminiPhotoFeedbackProvider({
      apiKey: environment.ai.apiKey,
      model: environment.ai.gemini.feedbackModel,
      timeoutMillis: environment.ai.gemini.timeoutMillis,
      maximumResponseBytes: environment.ai.gemini.maximumResponseBytes,
    })
    : new MockPhotoFeedbackProvider();
  const photoFeedbackProcessor = new ProviderPhotoFeedbackProcessor(
    database.db,
    imageStorage,
    photoFeedbackProvider,
  );
  const photoFeedbackWorker = new PhotoFeedbackWorker(
    database.db,
    photoFeedbackProcessor,
    {
      pollIntervalMillis: environment.sceneAnalysis.workerPollIntervalMillis,
      leaseSeconds: environment.sceneAnalysis.workerLeaseSeconds,
      retryBaseSeconds: environment.sceneAnalysis.workerRetryBaseSeconds,
      onTerminal: ({ uploadId, storagePath }) => uploadService.purgeConsumed(uploadId, storagePath),
    },
    logger,
  );
  const accountDeletionWorker = new AccountDeletionWorker(
    database.db,
    imageStorage,
    {
      pollIntervalMillis: environment.sceneAnalysis.workerPollIntervalMillis,
      leaseSeconds: environment.sceneAnalysis.workerLeaseSeconds,
      retryBaseSeconds: environment.privacy.deletionRetryBaseSeconds,
    },
    logger,
  );
  const retentionWorker = new RetentionWorker(
    database.db,
    imageStorage,
    {
      intervalMillis: environment.privacy.cleanupIntervalMillis,
      uploadMaximumAgeSeconds: environment.uploads.ttlSeconds,
      aiAttemptRetentionDays: environment.privacy.aiAttemptRetentionDays,
      temporaryFileGraceSeconds: environment.uploads.ttlSeconds,
    },
    logger,
  );
  const uploadIpRateLimiter = createIpRateLimiter({
    scope: "uploads",
    limit: environment.rateLimits.aiRequestsPerIpPerMinute,
  });
  const sceneAnalysisIpRateLimiter = createIpRateLimiter({
    scope: "scene-analyses",
    limit: environment.rateLimits.aiRequestsPerIpPerMinute,
  });
  const photoFeedbackIpRateLimiter = createIpRateLimiter({
    scope: "photo-feedbacks",
    limit: environment.rateLimits.aiRequestsPerIpPerMinute,
  });
  const authIpRateLimiter = createIpRateLimiter({
    scope: "auth",
    limit: environment.rateLimits.authRequestsPerIpPerMinute,
  });
  const appEventIpRateLimiter = createIpRateLimiter({
    scope: "app-events",
    limit: environment.rateLimits.appEventBatchesPerIpPerMinute,
  });
  const appEventService = new AppEventService(database.db, environment.productEvents);

  try {
    await Promise.all([
      verifyDatabaseConnection(database.pool),
      imageStorage.ready(),
    ]);
  } catch (error) {
    await closeDatabaseConnection(database.pool);
    throw error;
  }

  if (environment.sceneAnalysis.workerEnabled) {
    sceneAnalysisWorker.start();
    photoFeedbackWorker.start();
  }
  if (environment.privacy.workerEnabled) {
    accountDeletionWorker.start();
    retentionWorker.start();
  }

  const server = createApp({
    checkDatabase: () => verifyDatabaseConnection(database.pool),
    logger,
    http: environment.http,
    auth: {
      authService,
      googleAuthService,
      kakaoAuthService,
      tokenService,
      ipRateLimiter: authIpRateLimiter,
    },
    account: { service: accountService, tokenService },
    catalog: {
      service: catalogService,
      assetRoot: environment.catalog.assetRoot,
      interactionService: templateInteractionService,
    },
    uploads: {
      service: uploadService,
      storage: imageStorage,
      tokenService,
      ipRateLimiter: uploadIpRateLimiter,
    },
    appConfig: {
      app: environment.appConfig,
      guestLimits: environment.usage.guest,
      upload: { maxBytes: environment.uploads.maxBytes },
    },
    productEvents: {
      service: appEventService,
      tokenService,
      ipRateLimiter: appEventIpRateLimiter,
    },
    sceneAnalysis: {
      service: sceneAnalysisService,
      tokenService,
      ipRateLimiter: sceneAnalysisIpRateLimiter,
    },
    photoFeedback: {
      service: photoFeedbackService,
      tokenService,
      ipRateLimiter: photoFeedbackIpRateLimiter,
    },
  }).listen(environment.port, () => {
    logger.info({ port: environment.port }, "DearShot API listening");
  });

  let shuttingDown = false;

  const shutdown = (signal: NodeJS.Signals) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, "Shutting down DearShot API");

    void Promise.all([
      sceneAnalysisWorker.stop(),
      photoFeedbackWorker.stop(),
      accountDeletionWorker.stop(),
      retentionWorker.stop(),
    ]).then(() => {
      server.close(async (error) => {
        try {
          await closeDatabaseConnection(database.pool);
        } finally {
          if (error) {
            logger.error({ err: error }, "HTTP server failed to close cleanly");
            process.exitCode = 1;
          }
        }
      });
      server.closeAllConnections();
    });
  };

  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
}

main().catch((error: unknown) => {
  const logger = createLogger();
  logger.fatal({ err: error }, "DearShot API failed to start");
  process.exitCode = 1;
});
