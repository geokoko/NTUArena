#!/bin/sh
set -eu

npm start &
SERVER_PID=$!

BACKEND_PORT=${PORT:-3000}
HEALTH_URL="http://localhost:${BACKEND_PORT}/health"
MAX_ATTEMPTS=${HEALTHCHECK_RETRIES:-60}
SLEEP_INTERVAL=${HEALTHCHECK_INTERVAL:-5}
ATTEMPT=1

echo "Waiting for backend server to be ready at ${HEALTH_URL}..."

until curl -fsS "$HEALTH_URL" >/dev/null 2>&1; do
  if [ "$ATTEMPT" -ge "$MAX_ATTEMPTS" ]; then
    echo "Backend health check failed after ${MAX_ATTEMPTS} attempts."
    kill "$SERVER_PID" >/dev/null 2>&1 || true
    wait "$SERVER_PID" 2>/dev/null || true
    exit 1
  fi

  echo "Health check attempt ${ATTEMPT} failed; retrying in ${SLEEP_INTERVAL}s..."
  ATTEMPT=$((ATTEMPT + 1))
  sleep "$SLEEP_INTERVAL"
done

echo "Backend is healthy. Server is running with PID ${SERVER_PID}."
#echo "Backend is healthy. Starting tournament simulation."

# npm run simulate:tournament

# Do not kill the server on exit; let it run
trap 'kill "$SERVER_PID" 2>/dev/null || true' INT TERM
wait "$SERVER_PID"
