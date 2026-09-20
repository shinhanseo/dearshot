import "dotenv/config";
import path from "node:path";
import { loadEnvironment } from "../../config/environment.js";
import {
  closeDatabaseConnection,
  createDatabaseConnection,
  verifyDatabaseConnection,
} from "../../db/client.js";
import { createLogger } from "../../observability/logger.js";
import { importCatalog } from "../import-catalog.js";
import { readCatalogManifest } from "../manifest.js";

async function main() {
  const environment = loadEnvironment();
  const logger = createLogger({ level: environment.logLevel });
  const connection = createDatabaseConnection(environment.database, logger);
  const manifestPath = path.resolve(process.argv[2] ?? "catalog/seed.json");
  try {
    await verifyDatabaseConnection(connection.pool);
    const manifest = await readCatalogManifest(manifestPath);
    await importCatalog(connection.db, manifest, {
      assetRoot: path.resolve(environment.catalog.assetRoot),
    });
    console.log(`Catalog ${manifest.catalogVersion} imported from ${manifestPath}`);
  } finally {
    await closeDatabaseConnection(connection.pool);
  }
}

main().catch((error: unknown) => {
  console.error("Catalog import failed.", error);
  process.exitCode = 1;
});
