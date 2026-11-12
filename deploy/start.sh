#!/bin/sh
# Starts the relay. Idempotent: a second run reports the relay is already up instead of starting another one.
set -eu
cd "$(dirname "$0")"
if [ ! -f tokens ]; then
  echo "deploy/tokens is missing: one 'token label' line per person, chmod 600" >&2
  exit 1
fi
if docker compose ps --status running --services 2>/dev/null | grep -qx relay; then
  echo "relay already running"
  exit 0
fi
docker compose up -d
docker compose ps
