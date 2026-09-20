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

docker compose exec --no-TTY postgres sh -c \
  'pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB"'

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

echo "Compose verification passed: API healthy, PostgreSQL private, volume persistent."
