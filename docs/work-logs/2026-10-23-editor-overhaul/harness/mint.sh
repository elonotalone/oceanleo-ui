#!/usr/bin/env bash
# Mint a short-lived session token for a dev-acceptance user and write it to stdout.
# Never run this to a terminal: pipe it straight into run.mjs.
#   bash mint.sh | node run.mjs <scenario.mjs> [args…]
# Default user is the internal acceptance account (oceanleo-acl-accept@oceanleo.internal).
# Never pass the operator's id (3296855f-…): the dev gateway writes the production database.
set -euo pipefail
USER_ID="${1:-2ffeef37-102a-431b-b2c2-51c5675dba79}"
if [ "$USER_ID" = "3296855f-5acd-49bc-bba0-629bad087cda" ]; then
  echo "refusing: that is the operator's own account" >&2
  exit 2
fi
if [ -t 1 ]; then
  echo "refusing: stdout is a terminal; pipe into run.mjs" >&2
  exit 2
fi
docker exec -i oceanleo-api python - "$USER_ID" <<'PY'
import asyncio, sys
sys.path.insert(0, "/app")
from scripts import smoke_cloud_browser_http as common
sys.stdout.write(asyncio.run(common._owner_token(sys.argv[1], transport=None)))
PY
