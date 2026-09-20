import "dotenv/config";
import { createApp } from "./app.js";
import { AuthService } from "./auth/auth-service.js";
import { GoogleAuthLibraryVerifier } from "./auth/google/google-identity-verifier.js";
import { GoogleAuthService } from "./auth/google/google-auth-service.js";
import { KakaoAuthService } from "./auth/kakao/kakao-auth-service.js";
import { KakaoApiIdentityVerifier } from "./auth/kakao/kakao-identity-verifier.js";
import { SocialIdentityAuthService } from "./auth/social-identity-auth-service.js";
import { TokenService } from "./auth/token-service.js";
import { loadEnvironment } from "./config/environment.js";
import {
  closeDatabaseConnection,
  createDatabaseConnection,
  verifyDatabaseConnection,
} from "./db/client.js";
import { createLogger } from "./observability/logger.js";

async function main() {
  const environment = loadEnvironment();
  const logger = createLogger({ level: environment.logLevel });
  const database = createDatabaseConnection(environment.database, logger);
  const tokenService = new TokenService(environment.auth);
  const googleVerifier = new GoogleAuthLibraryVerifier(environment.google.webClientId);
  const authService = new AuthService(database.db, tokenService, environment.auth);
  const socialIdentityAuthService = new SocialIdentityAuthService(
    database.db,
    tokenService,
    environment.auth,
  );
  const googleAuthService = new GoogleAuthService(googleVerifier, socialIdentityAuthService);
  const kakaoVerifier = new KakaoApiIdentityVerifier(
    environment.kakao.appId,
    environment.kakao.apiTimeoutMillis,
  );
  const kakaoAuthService = new KakaoAuthService(kakaoVerifier, socialIdentityAuthService);

  try {
    await verifyDatabaseConnection(database.pool);
  } catch (error) {
    await closeDatabaseConnection(database.pool);
    throw error;
  }

  const server = createApp({
    checkDatabase: () => verifyDatabaseConnection(database.pool),
    logger,
    auth: { authService, googleAuthService, kakaoAuthService, tokenService },
  }).listen(environment.port, () => {
    logger.info({ port: environment.port }, "DearShot API listening");
  });

  let shuttingDown = false;

  const shutdown = (signal: NodeJS.Signals) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, "Shutting down DearShot API");

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
  };

  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
}

main().catch((error: unknown) => {
  const logger = createLogger();
  logger.fatal({ err: error }, "DearShot API failed to start");
  process.exitCode = 1;
});
