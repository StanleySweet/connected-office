#!/bin/sh
# This machine's whole office, every project (no exclude, no only_under, nothing sent), drawn by the forked collector
# (opencode and omp included) into ~/.cache/connected-office/office-<view>.html, then opened in the browser.
# Usage: agent/office-local.sh [all|live|today|week|month|work]   (default: all)
set -eu
ICI=$(cd "$(dirname "$0")" && pwd)
VUE=${1:-all}
OUT="$HOME/.cache/connected-office/office-$VUE.html"
mkdir -p "$(dirname "$OUT")"
THEOFFICE_CACHE_DIR="$HOME/.cache/connected-office" node "$ICI/../vendor/theoffice-agents/plugin/scripts/office.mjs" "$VUE" --html "$OUT" >/dev/null
# SVG and HTML open in Inkscape or an editor by default on some Macs: ask for a browser when one is there.
if [ "$(uname)" = Darwin ]; then open -a "Brave Browser" "$OUT" 2>/dev/null || open "$OUT"; else echo "$OUT"; fi
