#!/usr/bin/env bash
# Creates the Cadre database, runs migrations, seeds demo data.
# Safe to re-run: CREATE DATABASE IF NOT EXISTS, and the seed upserts.
set -euo pipefail

ROOT_PW="${MYSQL_ROOT_PASSWORD:-changeme}"
DB_NAME="${DB_NAME:-cadre}"

echo "→ Ensuring MySQL is running"
if ! nc -z localhost 3306 2>/dev/null; then
  brew services start mysql
  until nc -z localhost 3306 2>/dev/null; do sleep 1; done
fi

echo "→ Ensuring root password is set"
# A fresh Homebrew MySQL has an empty root password; ALTER is a no-op if it
# is already set, so try passwordless first and fall back.
mysql -u root -e "ALTER USER 'root'@'localhost' IDENTIFIED BY '${ROOT_PW}';" 2>/dev/null \
  || echo "  (password already set)"

echo "→ Creating database ${DB_NAME}"
mysql -u root -p"${ROOT_PW}" -e \
  "CREATE DATABASE IF NOT EXISTS ${DB_NAME} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"

echo "→ Running migrations"
npx prisma migrate dev --name init

echo "→ Seeding"
npx prisma db seed

echo
echo "Done. Tables created and seeded."
mysql -u root -p"${ROOT_PW}" -D "${DB_NAME}" -e "SHOW TABLES;"
