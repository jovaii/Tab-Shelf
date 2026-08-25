#!/bin/bash

set -euo pipefail
umask 077
PATH="/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin:/usr/libexec"
unset CDPATH

fail() {
  printf 'Tab Shelf App Store archive stopped: %s\n' "$1" >&2
  exit 1
}

ENTRYPOINT_PATH="${BASH_SOURCE[0]}"
[ ! -L "$ENTRYPOINT_PATH" ] \
  || fail "The archive entrypoint must not be a symbolic link."
SCRIPT_DIRECTORY_INPUT="$(/usr/bin/dirname -- "$ENTRYPOINT_PATH")" \
  || fail "Unable to resolve the script directory."
[ -d "$SCRIPT_DIRECTORY_INPUT" ] && [ ! -L "$SCRIPT_DIRECTORY_INPUT" ] \
  || fail "The archive script directory must not be a symbolic link."
SCRIPT_DIRECTORY_LOGICAL="$(cd -- "$SCRIPT_DIRECTORY_INPUT" && pwd -L)" \
  || fail "Unable to resolve the script directory."
SCRIPT_DIRECTORY="$(cd -- "$SCRIPT_DIRECTORY_INPUT" && pwd -P)" \
  || fail "Unable to resolve the script directory."
[ "$SCRIPT_DIRECTORY" = "$SCRIPT_DIRECTORY_LOGICAL" ] \
  || fail "The archive script directory must not cross a symbolic link."
PROJECT_ROOT="$(cd -- "$SCRIPT_DIRECTORY/.." && pwd -P)" \
  || fail "Unable to resolve the repository root."
[ "$SCRIPT_DIRECTORY" = "$PROJECT_ROOT/scripts" ] \
  || fail "The archive script directory is outside the repository."
WORKFLOW_HELPER="$SCRIPT_DIRECTORY/archive-app-store-workflow.sh"
[ -f "$WORKFLOW_HELPER" ] && [ ! -L "$WORKFLOW_HELPER" ] \
  || fail "The archive workflow helper must be a regular file and must not be a symbolic link."
case "$WORKFLOW_HELPER" in
  "$PROJECT_ROOT/scripts/archive-app-store-workflow.sh") ;;
  *) fail "The archive workflow helper is outside the repository." ;;
esac
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

unset ARCHIVE_TEAM_ID
ARCHIVE_TEAM_ID="${APPLE_TEAM_ID:-}"
[[ "$ARCHIVE_TEAM_ID" =~ ^[A-Z0-9]{10}$ ]] \
  || fail "APPLE_TEAM_ID must be set to a valid enrolled team identifier."
unset APPLE_TEAM_ID

source "$WORKFLOW_HELPER"
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
  "/usr/bin/dirname" \
  "/usr/bin/cmp"
