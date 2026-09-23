#!/bin/sh
# Deploy command for Cloudflare Workers Builds.
#
# Deploying from git wipes the Worker's runtime secrets, so anything set in the
# dashboard disappears on the next push (cloudflare/workers-sdk#8871). Instead
# the secrets live as encrypted *build* variables, and this writes them back on
# every deploy. --secrets-file adds to what is already there, so a secret left
# out here keeps whatever value it had.
set -eu

file=$(mktemp)
trap 'rm -f "$file"' EXIT
chmod 600 "$file"

for name in GOOGLE_CLIENT_SECRET SESSION_SECRET; do
  value=$(printenv "$name" || true)
  if [ -n "$value" ]; then
    printf '%s=%s\n' "$name" "$value" >> "$file"
  else
    echo "Aviso: falta la variable de compilación $name" >&2
  fi
done

# The accounts database keeps its shape in migrations/. Applying them here
# means a new table never waits on someone running a command by hand. It is
# skipped quietly while the database does not exist yet: the app says so on the
# account screen rather than the whole site failing to deploy.
if ! ${WRANGLER:-npx wrangler} d1 migrations apply bocados-cuentas --remote; then
  echo "Aviso: no se pudieron aplicar las migraciones de la base de datos de cuentas" >&2
fi

if [ -s "$file" ]; then
  ${WRANGLER:-npx wrangler} deploy --secrets-file "$file"
else
  ${WRANGLER:-npx wrangler} deploy
fi
