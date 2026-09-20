import "dotenv/config";
import path from "node:path";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { loadEnvironment } from "../../config/environment.js";
import { closeDatabaseConnection, createDatabaseConnection } from "../client.js";

export async function migrateDatabase(databaseUrl?: string): Promise<void> {
  const source = databaseUrl ? { ...process.env, DATABASE_URL: databaseUrl } : process.env;
  const environment = loadEnvironment(source);
  const connection = createDatabaseConnection(environment.database);

  try {
    await migrate(connection.db, {
      migrationsFolder: path.resolve(process.cwd(), "drizzle"),
    });
  } finally {
    await closeDatabaseConnection(connection.pool);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  migrateDatabase()
    .then(() => console.log("Database migrations are up to date."))
    .catch((error: unknown) => {
      console.error("Database migration failed.", error);
      process.exitCode = 1;
    });
}
