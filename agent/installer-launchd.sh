#!/bin/sh
# Installs (or reinstalls) the push agent as a macOS LaunchAgent: starts at login, restarts if it dies.
# Needs agent/config.json (from config.example.json, chmod 600). Logs: ~/Library/Logs/connected-office.log.
# `installer-launchd.sh local`: this machine's own unfiltered office instead (agent/local.mjs, http://127.0.0.1:7320/),
# label connected-office.local, logs ~/Library/Logs/connected-office-local.log. Both can run side by side.
# Remove: launchctl bootout gui/$(id -u)/connected-office && rm ~/Library/LaunchAgents/connected-office.plist
set -eu
ICI=$(cd "$(dirname "$0")" && pwd)
NODE=$(command -v node) || { echo "node introuvable dans le PATH" >&2; exit 1; }
if [ "${1:-}" = local ]; then
  LABEL=connected-office.local; SCRIPT=local.mjs; LOG=connected-office-local
else
  [ -f "$ICI/config.json" ] || { echo "agent/config.json absent (modele : config.example.json)" >&2; exit 1; }
  LABEL=connected-office; SCRIPT=push.mjs; LOG=connected-office
fi
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
mkdir -p "$HOME/Library/LaunchAgents" "$HOME/Library/Logs"
cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key><array><string>$NODE</string><string>$ICI/$SCRIPT</string></array>
  <key>WorkingDirectory</key><string>$ICI</string>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>ThrottleInterval</key><integer>60</integer>
  <key>StandardOutPath</key><string>$HOME/Library/Logs/$LOG.log</string>
  <key>StandardErrorPath</key><string>$HOME/Library/Logs/$LOG.log</string>
</dict>
</plist>
EOF
launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST"
echo "installe : $PLIST"
