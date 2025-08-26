#!/bin/sh

# Exit immediately if a command exits with a non-zero status.
set -e

# It's good practice to wait for the database to be truly ready,
# although docker-compose's `depends_on` with `service_healthy` handles the initial availability.
# Drizzle's migrate command will connect to the DB.

echo "Running database migrations..."
# This uses the script defined in your package.json
npx drizzle-kit migrate --config drizzle.config.ts

echo "Migrations complete."

# Execute the CMD passed to this entrypoint (i.e., starts the Node.js app)
exec "$@"