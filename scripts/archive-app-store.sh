#!/bin/bash

set -euo pipefail
umask 077
PATH="${PATH:+$PATH:}/usr/libexec"

fail() {
  printf 'Tab Shelf App Store archive stopped: %s\n' "$1" >&2
  exit 1
}

SCRIPT_DIRECTORY="$(dirname -- "${BASH_SOURCE[0]}")" \
  || fail "Unable to resolve the script directory."
PROJECT_ROOT="$(cd -- "$SCRIPT_DIRECTORY/.." && pwd -P)" \
  || fail "Unable to resolve the repository root."
XCODE_APP="${TAB_SHELF_XCODE_APP:-/Applications/Xcode.app}"
DEVELOPER_DIR_PATH="${TAB_SHELF_DEVELOPER_DIR:-/Applications/Xcode.app/Contents/Developer}"
GENERATED_ROOT="$PROJECT_ROOT/native/generated"
BUILD_ROOT="$PROJECT_ROOT/build"
ARCHIVE_ROOT="$BUILD_ROOT/app-store"
ARCHIVE_PATH="$ARCHIVE_ROOT/Tab Shelf.xcarchive"
ARCHIVE_LOCK="$ARCHIVE_ROOT/.tab-shelf-archive.lock"
EXPECTED_APP_IDENTIFIER="com.jovaii.tabshelf"
EXPECTED_EXTENSION_IDENTIFIER="com.jovaii.tabshelf.extension"
EXPECTED_VERSION="1.0.0"
EXPECTED_BUILD="1"
LOCK_OWNED=0
LOCK_IDENTITY=""
ARCHIVE_PARENT_IDENTITY=""

require_inside_repository() {
  local candidate="$1"
  case "$candidate" in
    "$PROJECT_ROOT"|"$PROJECT_ROOT"/*) ;;
    *) fail "A required path is outside the repository." ;;
  esac
}

require_safe_directory() {
  local candidate="$1" canonical
  require_inside_repository "$candidate"
  [ -d "$candidate" ] || fail "A required directory is missing."
  [ ! -L "$candidate" ] || fail "A required directory must not be a symbolic link."
  canonical="$(cd -- "$candidate" && pwd -P)" \
    || fail "Unable to verify a required directory."
  case "$canonical" in
    "$PROJECT_ROOT"|"$PROJECT_ROOT"/*) ;;
    *) fail "A required path resolves outside the repository." ;;
  esac
  [ "$canonical" = "$candidate" ] \
    || fail "A required directory must not cross a symbolic link."
}

require_safe_file() {
  local candidate="$1" parent link_count
  require_inside_repository "$candidate"
  parent="$(dirname -- "$candidate")" || fail "Unable to verify a required file."
  require_safe_directory "$parent"
  [ -f "$candidate" ] || fail "A required file is missing."
  [ ! -L "$candidate" ] || fail "A required file must not be a symbolic link."
  link_count="$(stat -f '%l' "$candidate")" \
    || fail "Unable to inspect a required file."
  [[ "$link_count" =~ ^[0-9]+$ ]] \
    || fail "Unable to inspect a required file."
  [ "$link_count" -eq 1 ] || fail "A required file must not be a hard link."
}

directory_identity() {
  local candidate="$1" identity
  require_safe_directory "$candidate"
  identity="$(stat -f '%d:%i:%HT' "$candidate")" \
    || fail "Unable to inspect a required directory."
  [[ "$identity" =~ ^[0-9]+:[0-9]+:Directory$ ]] \
    || fail "Unable to inspect a required directory."
  printf '%s\n' "$identity"
}

require_same_directory() {
  local candidate="$1" expected="$2" current
  current="$(directory_identity "$candidate")" \
    || fail "Unable to revalidate a required directory."
  [ "$current" = "$expected" ] \
    || fail "A required directory changed during archiving."
}

ensure_safe_child_directory() {
  local parent="$1" candidate="$2" actual_parent
  require_safe_directory "$parent"
  actual_parent="$(dirname -- "$candidate")" \
    || fail "Unable to verify an archive directory."
  [ "$actual_parent" = "$parent" ] \
    || fail "An archive directory is outside its validated parent."
  if [ ! -e "$candidate" ] && [ ! -L "$candidate" ]; then
    mkdir -m 700 "$candidate" || fail "Unable to create the local archive directory."
  fi
  require_safe_directory "$candidate"
}

require_plist_value() {
  local plist="$1" key="$2" expected="$3" actual
  require_safe_file "$plist"
  actual="$(PlistBuddy -c "Print :$key" "$plist" 2>/dev/null)" \
    || fail "Archive identity verification failed."
  [ "$actual" = "$expected" ] \
    || fail "Archive identity verification failed."
}

count_generated_projects() {
  find "$GENERATED_ROOT" -type d -name '*.xcodeproj' -prune -print \
    | awk 'END { print NR }'
}

require_single_bundle() {
  local parent="$1" suffix="$2" expected="$3" candidate
  local -a matches=()
  require_safe_directory "$parent"
  shopt -s nullglob
  for candidate in "$parent"/*"$suffix"; do
    [ -d "$candidate" ] && [ ! -L "$candidate" ] \
      || fail "Archive bundle verification failed."
    require_safe_directory "$candidate"
    matches+=("$candidate")
  done
  shopt -u nullglob
  [ "${#matches[@]}" -eq 1 ] \
    || fail "Archive bundle verification failed."
  [ "${matches[0]}" = "$expected" ] \
    || fail "Archive bundle verification failed."
  printf '%s\n' "${matches[0]}"
}

release_archive_lock() {
  local current
  [ "$LOCK_OWNED" -eq 1 ] || return 0
  [ -n "$LOCK_IDENTITY" ] || return 0
  [ -d "$ARCHIVE_LOCK" ] && [ ! -L "$ARCHIVE_LOCK" ] || return 0
  current="$(stat -f '%d:%i:%HT' "$ARCHIVE_LOCK" 2>/dev/null)" || return 0
  [ "$current" = "$LOCK_IDENTITY" ] || return 0
  rmdir "$ARCHIVE_LOCK" >/dev/null 2>&1 || return 0
  LOCK_OWNED=0
}

acquire_archive_lock() {
  [ ! -e "$ARCHIVE_LOCK" ] && [ ! -L "$ARCHIVE_LOCK" ] \
    || fail "Another local archive operation is already active."
  mkdir -m 700 "$ARCHIVE_LOCK" \
    || fail "Another local archive operation is already active."
  LOCK_IDENTITY="$(directory_identity "$ARCHIVE_LOCK")" \
    || fail "Unable to verify the local archive lock."
  LOCK_OWNED=1
  trap release_archive_lock EXIT
  trap 'exit 129' HUP
  trap 'exit 130' INT
  trap 'exit 143' TERM
}

APPLE_TEAM_ID="${APPLE_TEAM_ID:-}"
[[ "$APPLE_TEAM_ID" =~ ^[A-Z0-9]{10}$ ]] \
  || fail "APPLE_TEAM_ID must be set to a valid enrolled team identifier."

[ -d "$XCODE_APP" ] \
  || fail "Full Xcode is required. Install Xcode and complete its first-launch setup."
[ -d "$DEVELOPER_DIR_PATH" ] \
  || fail "Full Xcode is incomplete. Complete its first-launch setup."
DEVELOPER_DIR="$DEVELOPER_DIR_PATH" xcrun --find xcodebuild >/dev/null 2>&1 \
  || fail "Full Xcode does not provide xcodebuild."
XCODE_VERSION="$(DEVELOPER_DIR="$DEVELOPER_DIR_PATH" xcodebuild -version 2>/dev/null)" \
  || fail "Unable to verify the installed Xcode version."
[ "$XCODE_VERSION" = $'Xcode 26.6\nBuild version 17F113' ] \
  || fail "This archive workflow requires Xcode 26.6 build 17F113."

require_safe_directory "$PROJECT_ROOT"
ensure_safe_child_directory "$PROJECT_ROOT" "$BUILD_ROOT"
require_safe_directory "$GENERATED_ROOT"
XCODE_PROJECT="$GENERATED_ROOT/Tab Shelf/Tab Shelf.xcodeproj"
require_safe_directory "$XCODE_PROJECT"
require_safe_file "$XCODE_PROJECT/project.pbxproj"
PROJECT_COUNT="$(count_generated_projects)" \
  || fail "Unable to inspect generated Xcode projects."
[ "$PROJECT_COUNT" = "1" ] \
  || fail "Expected exactly one generated Xcode project."

npm run check:app-store

ensure_safe_child_directory "$BUILD_ROOT" "$ARCHIVE_ROOT"
ARCHIVE_PARENT_IDENTITY="$(directory_identity "$ARCHIVE_ROOT")" \
  || fail "Unable to verify the local archive directory."
[ ! -e "$ARCHIVE_PATH" ] && [ ! -L "$ARCHIVE_PATH" ] \
  || fail "The local archive already exists. Move it aside before archiving again."
acquire_archive_lock
require_same_directory "$ARCHIVE_ROOT" "$ARCHIVE_PARENT_IDENTITY"
require_same_directory "$ARCHIVE_LOCK" "$LOCK_IDENTITY"
[ ! -e "$ARCHIVE_PATH" ] && [ ! -L "$ARCHIVE_PATH" ] \
  || fail "The local archive already exists. Move it aside before archiving again."

# Shell-level identity checks narrow races; a same-user filesystem adversary can still race after this revalidation.
if DEVELOPER_DIR="$DEVELOPER_DIR_PATH" xcodebuild \
  -project "$XCODE_PROJECT" \
  -scheme "Tab Shelf" \
  -configuration Release \
  -destination generic/platform=macOS \
  -archivePath "$ARCHIVE_PATH" \
  DEVELOPMENT_TEAM="$APPLE_TEAM_ID" \
  CODE_SIGN_STYLE=Automatic \
  archive >/dev/null 2>&1; then
  :
else
  XCODE_STATUS=$?
  printf 'Tab Shelf App Store archive stopped: Xcode could not create the local archive.\n' >&2
  exit "$XCODE_STATUS"
fi

ARCHIVE_INFO="$ARCHIVE_PATH/Info.plist"
ARCHIVE_APPLICATIONS="$ARCHIVE_PATH/Products/Applications"
require_safe_directory "$ARCHIVE_PATH"
require_plist_value "$ARCHIVE_INFO" "ApplicationProperties:CFBundleIdentifier" "$EXPECTED_APP_IDENTIFIER"
require_plist_value "$ARCHIVE_INFO" "ApplicationProperties:CFBundleShortVersionString" "$EXPECTED_VERSION"
require_plist_value "$ARCHIVE_INFO" "ApplicationProperties:CFBundleVersion" "$EXPECTED_BUILD"
ARCHIVED_APP="$(require_single_bundle "$ARCHIVE_APPLICATIONS" '.app' "$ARCHIVE_APPLICATIONS/Tab Shelf.app")" \
  || fail "Archive bundle verification failed."
ARCHIVED_EXTENSION="$(require_single_bundle "$ARCHIVED_APP/Contents/PlugIns" '.appex' "$ARCHIVED_APP/Contents/PlugIns/Tab Shelf Extension.appex")" \
  || fail "Archive bundle verification failed."
require_plist_value "$ARCHIVED_APP/Contents/Info.plist" "CFBundleIdentifier" "$EXPECTED_APP_IDENTIFIER"
require_plist_value "$ARCHIVED_APP/Contents/Info.plist" "CFBundleShortVersionString" "$EXPECTED_VERSION"
require_plist_value "$ARCHIVED_APP/Contents/Info.plist" "CFBundleVersion" "$EXPECTED_BUILD"
require_plist_value "$ARCHIVED_EXTENSION/Contents/Info.plist" "CFBundleIdentifier" "$EXPECTED_EXTENSION_IDENTIFIER"
require_plist_value "$ARCHIVED_EXTENSION/Contents/Info.plist" "CFBundleShortVersionString" "$EXPECTED_VERSION"
require_plist_value "$ARCHIVED_EXTENSION/Contents/Info.plist" "CFBundleVersion" "$EXPECTED_BUILD"

printf 'Tab Shelf local archive created:\n  %s\nOpen Xcode Organizer yourself to validate this archive; any later release action remains separate.\n' \
  "$ARCHIVE_PATH"
