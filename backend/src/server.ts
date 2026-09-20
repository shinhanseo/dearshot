import "dotenv/config";
import { createApp } from "./app.js";
import { loadEnvironment } from "./config/environment.js";
import {
  closeDatabaseConnection,
  createDatabaseConnection,
  verifyDatabaseConnection,
} from "./db/client.js";

async function main() {
  const environment = loadEnvironment();
  const database = createDatabaseConnection(environment.database);

  try {
    await verifyDatabaseConnection(database.pool);
  } catch (error) {
    await closeDatabaseConnection(database.pool);
    throw error;
  }

  const server = createApp({
    checkDatabase: () => verifyDatabaseConnection(database.pool),
  }).listen(environment.port, () => {
    console.log(`DearShot API listening on http://localhost:${environment.port}`);
  });

  let shuttingDown = false;

  const shutdown = (signal: NodeJS.Signals) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`Received ${signal}; shutting down DearShot API.`);

    server.close(async (error) => {
      try {
        await closeDatabaseConnection(database.pool);
      } finally {
        if (error) {
          console.error("HTTP server failed to close cleanly.", error);
          process.exitCode = 1;
        }
      }
    });
  };

  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
}

main().catch((error: unknown) => {
  console.error("DearShot API failed to start.", error);
  process.exitCode = 1;
});
