#!/usr/bin/env bash
set -Eeuo pipefail

gunicorn \
    --bind "0.0.0.0:${FLASK_PORT}" \
    --workers "${GUNICORN_WORKERS:-1}" \
    --timeout "${GUNICORN_TIMEOUT:-180}" \
    app:app &
flask_pid=$!

node server.js &
express_pid=$!

shutdown() {
    kill "${flask_pid}" "${express_pid}" 2>/dev/null || true
    wait "${flask_pid}" "${express_pid}" 2>/dev/null || true
}

trap shutdown SIGINT SIGTERM

set +e
wait -n "${flask_pid}" "${express_pid}"
status=$?
set -e

shutdown
exit "${status}"
