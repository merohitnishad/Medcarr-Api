#!/usr/bin/env sh
set -e

# wait-for-postgres.sh needs DB_HOST and DB_PORT in environment
: "${DB_HOST:?need DB_HOST env var}"
: "${DB_PORT:?need DB_PORT env var}"

# Block until Postgres is ready, then run migrations
/usr/local/bin/wait-for-postgres.sh "$DB_HOST:$DB_PORT" -- \
  npx drizzle-kit migrate:deploy \
  && echo "✔️ Migrations applied, launching app…" \
  && exec "$@"
