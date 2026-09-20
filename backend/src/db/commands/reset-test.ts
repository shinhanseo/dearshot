import "dotenv/config";
import pg from "pg";
import { migrateDatabase } from "./migrate.js";

const { Pool } = pg;
const TEST_DATABASE_SUFFIX = "_test";

function requireTestDatabaseUrl(): URL {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Test database reset is disabled in production.");
  }

  const rawUrl = process.env.TEST_DATABASE_URL;
  if (!rawUrl) {
    throw new Error("TEST_DATABASE_URL is required.");
  }

  const url = new URL(rawUrl);
  const databaseName = decodeURIComponent(url.pathname.slice(1));

  if (!databaseName.endsWith(TEST_DATABASE_SUFFIX)) {
    throw new Error(`Refusing to reset a database whose name does not end with ${TEST_DATABASE_SUFFIX}.`);
  }
  if (!/^[A-Za-z0-9_]+$/.test(databaseName)) {
    throw new Error("Test database name may contain only letters, numbers, and underscores.");
  }

  return url;
}

async function resetTestDatabase(): Promise<void> {
  const testUrl = requireTestDatabaseUrl();
  const databaseName = decodeURIComponent(testUrl.pathname.slice(1));
  const adminUrl = new URL(testUrl);
  adminUrl.pathname = "/postgres";

  const adminPool = new Pool({ connectionString: adminUrl.toString(), max: 1 });

  try {
    await adminPool.query(
      "select pg_terminate_backend(pid) from pg_stat_activity where datname = $1 and pid <> pg_backend_pid()",
      [databaseName],
    );
    await adminPool.query(`drop database if exists "${databaseName}"`);
    await adminPool.query(`create database "${databaseName}"`);
  } finally {
    await adminPool.end();
  }

  await migrateDatabase(testUrl.toString());
  console.log(`Test database ${databaseName} was reset and migrated.`);
}

resetTestDatabase().catch((error: unknown) => {
  console.error("Test database reset failed.", error);
  process.exitCode = 1;
});
