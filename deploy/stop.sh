#!/bin/sh
# Stops the relay. The cached facts stay in the named volume, so a restart draws the last known office at once.
set -eu
cd "$(dirname "$0")"
docker compose down
