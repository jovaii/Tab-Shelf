#!/bin/bash

set -euo pipefail
umask 077
PATH="/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin:/usr/libexec"

fail() {
  printf 'Tab Shelf App Store archive stopped: %s\n' "$1" >&2
  exit 1
}

SCRIPT_DIRECTORY="$(/usr/bin/dirname -- "${BASH_SOURCE[0]}")" \
  || fail "Unable to resolve the script directory."
PROJECT_ROOT="$(cd -- "$SCRIPT_DIRECTORY/.." && pwd -P)" \
  || fail "Unable to resolve the repository root."
XCODE_APP="/Applications/Xcode.app"
DEVELOPER_DIR_PATH="/Applications/Xcode.app/Contents/Developer"
NODE_EXECUTABLE="$(command -v node)" \
  || fail "A supported Node executable is required for readiness checks."
case "$NODE_EXECUTABLE" in
  /*) ;;
  *) fail "A supported Node executable is required for readiness checks." ;;
esac
[ -f "$NODE_EXECUTABLE" ] && [ -x "$NODE_EXECUTABLE" ] \
  || fail "A supported Node executable is required for readiness checks."

ARCHIVE_TEAM_ID="${APPLE_TEAM_ID:-}"
[[ "$ARCHIVE_TEAM_ID" =~ ^[A-Z0-9]{10}$ ]] \
  || fail "APPLE_TEAM_ID must be set to a valid enrolled team identifier."
unset APPLE_TEAM_ID

source "$SCRIPT_DIRECTORY/archive-app-store-workflow.sh"
archive_app_store_workflow \
  "$PROJECT_ROOT" \
  "$ARCHIVE_TEAM_ID" \
  "$XCODE_APP" \
  "$DEVELOPER_DIR_PATH" \
  "$NODE_EXECUTABLE" \
  "/usr/bin/xcrun" \
  "/usr/bin/xcodebuild" \
  "/usr/bin/stat" \
  "/usr/bin/find" \
  "/usr/bin/awk" \
  "/usr/libexec/PlistBuddy" \
  "/bin/mkdir" \
  "/bin/rmdir" \
  "/usr/bin/dirname"
