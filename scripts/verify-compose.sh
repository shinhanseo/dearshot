#!/usr/bin/env sh

set -eu

if [ ! -f backend/.env ] || [ ! -f backend/.env.postgres ]; then
  echo "backend/.env and backend/.env.postgres are required. Copy both example files first." >&2
  exit 1
fi

cleanup() {
  docker compose down >/dev/null 2>&1 || true
}

show_logs() {
  docker compose ps || true
  docker compose logs --no-color api postgres || true
}

wait_for_api() {
  attempt=1
  while [ "$attempt" -le 30 ]; do
    if curl --fail --silent http://127.0.0.1:3000/health >/dev/null 2>&1; then
      return 0
    fi
    attempt=$((attempt + 1))
    sleep 2
  done

  echo "API did not become healthy." >&2
  show_logs
  return 1
}

trap cleanup EXIT INT TERM

docker compose config --quiet
docker compose up --detach --build
wait_for_api

api_container_id="$(docker compose ps --quiet api)"
api_log_config="$(docker inspect "$api_container_id" --format \
  '{{.HostConfig.LogConfig.Type}}:{{index .HostConfig.LogConfig.Config "max-size"}}:{{index .HostConfig.LogConfig.Config "max-file"}}')"

if [ "$api_log_config" != "json-file:10m:5" ]; then
  echo "API Docker logs must use json-file rotation with 10m x 5." >&2
  show_logs
  exit 1
fi

if ! docker logs "$api_container_id" 2>&1 | grep -q '"service":"dearshot-api"'; then
  echo "API did not emit structured Pino JSON logs to stdout." >&2
  show_logs
  exit 1
fi

docker compose exec --no-TTY postgres sh -c \
  'pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB"'

docker compose exec --no-TTY api npm run db:migrate
migration_count_before_repeat="$(docker compose exec --no-TTY postgres sh -c \
  'psql -At -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "SELECT count(*) FROM drizzle.__drizzle_migrations;"')"
docker compose exec --no-TTY api npm run db:migrate
migration_count_after_repeat="$(docker compose exec --no-TTY postgres sh -c \
  'psql -At -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "SELECT count(*) FROM drizzle.__drizzle_migrations;"')"
docker compose exec --no-TTY api npm run db:seed

if [ "$migration_count_before_repeat" -lt 1 ] || \
  [ "$migration_count_before_repeat" != "$migration_count_after_repeat" ]; then
  echo "Drizzle migration repeat changed the applied migration count." >&2
  show_logs
  exit 1
fi

docker compose exec --no-TTY api npm run db:test:reset
docker compose exec --no-TTY api npm run db:test:reset

test_database_name="$(docker compose exec --no-TTY api node -e \
  'process.stdout.write(new URL(process.env.TEST_DATABASE_URL).pathname.slice(1))')"

test_migration_count="$(docker compose exec --no-TTY postgres sh -c \
  "psql -At -U \"\$POSTGRES_USER\" -d '$test_database_name' -c 'SELECT count(*) FROM drizzle.__drizzle_migrations;'")"

if [ "$test_migration_count" -lt 1 ]; then
  echo "Test database reset did not apply Drizzle migrations." >&2
  show_logs
  exit 1
fi

if docker compose exec --no-TTY api sh -c \
  'TEST_DATABASE_URL="$DATABASE_URL" npm run db:test:reset' >/dev/null 2>&1; then
  echo "Test database reset must reject the development database." >&2
  show_logs
  exit 1
fi

postgres_container_id="$(docker compose ps --quiet postgres)"
published_postgres_binding="$(docker inspect "$postgres_container_id" --format '{{json (index .NetworkSettings.Ports "5432/tcp")}}')"
if [ "$published_postgres_binding" != "null" ]; then
  echo "PostgreSQL must not publish port 5432 to the host." >&2
  exit 1
fi

docker compose exec --no-TTY postgres sh -c \
  'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "CREATE TABLE IF NOT EXISTS compose_persistence_probe (id integer PRIMARY KEY); INSERT INTO compose_persistence_probe (id) VALUES (1) ON CONFLICT DO NOTHING;"'

docker compose down
docker compose up --detach
wait_for_api

probe_count="$(docker compose exec --no-TTY postgres sh -c \
  'psql -At -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "SELECT count(*) FROM compose_persistence_probe WHERE id = 1;"')"

if [ "$probe_count" != "1" ]; then
  echo "PostgreSQL data did not survive docker compose down/up." >&2
  show_logs
  exit 1
fi

docker compose exec --no-TTY postgres sh -c \
  'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "DROP TABLE compose_persistence_probe;"'

echo "Compose verification passed: API and database healthy, migrations repeatable, test DB isolated, PostgreSQL private, volume persistent."
