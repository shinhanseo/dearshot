import "dotenv/config";
import { loadEnvironment } from "../../config/environment.js";
import { createLogger } from "../../observability/logger.js";
import {
  closeDatabaseConnection,
  createDatabaseConnection,
  verifyDatabaseConnection,
} from "../client.js";

async function seedDatabase(): Promise<void> {
  const environment = loadEnvironment();
  const logger = createLogger({ level: environment.logLevel });
  const connection = createDatabaseConnection(environment.database, logger);

  try {
    await verifyDatabaseConnection(connection.pool);
    // Feature-owned, idempotent seed data will be added with the catalog schema in B-09.
    console.log("No feature seed data is defined yet.");
  } finally {
    await closeDatabaseConnection(connection.pool);
  }
}

seedDatabase().catch((error: unknown) => {
  console.error("Database seed failed.", error);
  process.exitCode = 1;
});
