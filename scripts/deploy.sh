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

if [ -s "$file" ]; then
  ${WRANGLER:-npx wrangler} deploy --secrets-file "$file"
else
  ${WRANGLER:-npx wrangler} deploy
fi
