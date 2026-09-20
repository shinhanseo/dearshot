import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import pg from "pg";
import type { Logger } from "pino";
import type { DatabaseConfig } from "../config/environment.js";
import * as schema from "./schema/index.js";

const { Pool } = pg;

export type Database = NodePgDatabase<typeof schema>;

export type DatabaseConnection = {
  db: Database;
  pool: pg.Pool;
};

export function createDatabaseConnection(
  config: DatabaseConfig,
  logger: Pick<Logger, "error">,
): DatabaseConnection {
  const pool = new Pool({
    connectionString: config.connectionString,
    max: config.maxConnections,
    connectionTimeoutMillis: config.connectionTimeoutMillis,
    idleTimeoutMillis: config.idleTimeoutMillis,
  });

  pool.on("error", (error) => {
    logger.error({ err: error }, "Unexpected PostgreSQL pool error");
  });

  return {
    pool,
    db: drizzle(pool, { schema }),
  };
}

export async function verifyDatabaseConnection(pool: pg.Pool): Promise<void> {
  await pool.query("select 1");
}

export async function closeDatabaseConnection(pool: pg.Pool): Promise<void> {
  await pool.end();
}
