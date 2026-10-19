#!/bin/sh
# Process roles of the ProfitLens image. Usage: web | worker | migrate | cli <command> [args]
set -e
role="${1:-web}"
[ "$#" -gt 0 ] && shift
case "$role" in
  healthcheck)
    # Container health for the role this container runs: web answers /api/health; the worker refreshes a beat file.
    if [ "$(cat /tmp/profitlens-role 2>/dev/null)" = "worker" ]; then
      exec node -e "const s=require('fs').statSync('/tmp/profitlens-worker-beat');process.exit(Date.now()-s.mtimeMs<180000?0:1)"
    fi
    exec node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" ;;
  web) echo web > /tmp/profitlens-role; exec node /app/web/apps/web/server.js ;;
  worker) echo worker > /tmp/profitlens-role; exec node /app/worker/main.mjs ;;
  migrate) exec node /app/worker/migrate.mjs ;;
  cli) exec node /app/worker/cli.mjs "$@" ;;
  *) echo "unknown role: $role (web | worker | migrate | cli)" >&2; exit 64 ;;
esac
