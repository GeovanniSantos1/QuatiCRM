#!/bin/sh
set -eu
cd /workspace
node scripts/preview.mjs stop || true
DATABASE_URL=$(node --input-type=module -e 'import { quatiDatabaseUrl } from "./scripts/quati-database-url.mjs"; process.stdout.write(quatiDatabaseUrl)')
export DATABASE_URL
node scripts/apply-quati-db.mjs >>/tmp/app-startup.log 2>&1
if curl -sf -o /dev/null --max-time 2 http://127.0.0.1:8080/; then
  exit 0
fi
npm run dev >>/tmp/app-startup.log 2>&1 &
