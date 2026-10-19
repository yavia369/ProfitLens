#!/bin/sh
# Process roles of the ProfitLens image. Usage: web | worker | migrate | cli <command> [args]
# The role can also come from PROCESS_ROLE (platforms that set variables more easily than commands), and a start
# command that repeats this script's path (`/app/docker-entrypoint.sh worker`) works whether the platform replaces
# the entrypoint or passes the command to it.
set -e
case "${1:-}" in */docker-entrypoint.sh | docker-entrypoint.sh) shift ;; esac
role="${1:-${PROCESS_ROLE:-web}}"
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
