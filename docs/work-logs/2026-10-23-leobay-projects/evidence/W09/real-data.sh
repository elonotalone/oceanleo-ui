#!/usr/bin/env bash
# W09 真数据读数（只读）：库里 content_cases → 真后端 store.public_view → 共享 UI 的模型 / 规则 / 名字。
# 用法：bash real-data.sh   （需要 supabase-sql；不写库、不起网关）
set -euo pipefail
OUT=${OUT:-/tmp/w09}
mkdir -p "$OUT"
supabase-sql oceanleo "select * from content_cases order by created_at desc" > "$OUT/real-cases.json"
(cd /root/projects/oceanleo/backend && OUT="$OUT" .venv/bin/python - <<'PY'
import json, os
from app.moderation import store
out = os.environ["OUT"]
rows = json.load(open(f"{out}/real-cases.json"))
json.dump({"cases": [store.public_view(r) for r in rows], "family": "com"}, open(f"{out}/real-views.json", "w"), ensure_ascii=False)
PY
)
cd /root/projects/oceanleo-ui && node --experimental-strip-types "$(dirname "$0")/real.mjs"
