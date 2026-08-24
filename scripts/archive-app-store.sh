#!/bin/bash

set -euo pipefail

fail() {
  printf 'Tab Shelf App Store archive stopped: %s\n' "$1" >&2
  exit 1
}

SCRIPT_DIRECTORY="$(dirname -- "${BASH_SOURCE[0]}")" \
  || fail "Unable to resolve the script directory."
PROJECT_ROOT="$(cd -- "$SCRIPT_DIRECTORY/.." && pwd -P)" \
  || fail "Unable to resolve the repository root."
XCODE_APP="/Applications/Xcode.app"
DEVELOPER_DIR_PATH="/Applications/Xcode.app/Contents/Developer"
GENERATED_ROOT="$PROJECT_ROOT/native/generated"
BUILD_ROOT="$PROJECT_ROOT/build"
ARCHIVE_ROOT="$BUILD_ROOT/app-store"
ARCHIVE_PATH="$ARCHIVE_ROOT/Tab Shelf.xcarchive"
EXPECTED_APP_IDENTIFIER="com.jovaii.tabshelf"
EXPECTED_EXTENSION_IDENTIFIER="com.jovaii.tabshelf.extension"
EXPECTED_VERSION="1.0.0"
EXPECTED_BUILD="1"

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
  link_count="$(/usr/bin/stat -f '%l' "$candidate")" \
    || fail "Unable to inspect a required file."
  [[ "$link_count" =~ ^[0-9]+$ ]] \
    || fail "Unable to inspect a required file."
  [ "$link_count" -eq 1 ] || fail "A required file must not be a hard link."
}

require_plist_value() {
  local plist="$1" key="$2" expected="$3" actual
  require_safe_file "$plist"
  actual="$(/usr/libexec/PlistBuddy -c "Print :$key" "$plist" 2>/dev/null)" \
    || fail "Archive identity verification failed."
  [ "$actual" = "$expected" ] \
    || fail "Archive identity verification failed."
}

count_generated_projects() {
  /usr/bin/find "$GENERATED_ROOT" -type d -name '*.xcodeproj' -prune -print \
    | /usr/bin/awk 'END { print NR }'
}

APPLE_TEAM_ID="${APPLE_TEAM_ID:-}"
[[ "$APPLE_TEAM_ID" =~ ^[A-Z0-9]{10}$ ]] \
  || fail "APPLE_TEAM_ID must be set to a valid enrolled team identifier."

[ -d "$XCODE_APP" ] \
  || fail "Full Xcode is required. Install Xcode and complete its first-launch setup."
[ -d "$DEVELOPER_DIR_PATH" ] \
  || fail "Full Xcode is incomplete. Complete its first-launch setup."
DEVELOPER_DIR="$DEVELOPER_DIR_PATH" /usr/bin/xcrun --find xcodebuild >/dev/null 2>&1 \
  || fail "Full Xcode does not provide xcodebuild."
XCODE_VERSION="$(DEVELOPER_DIR="$DEVELOPER_DIR_PATH" /usr/bin/xcodebuild -version 2>/dev/null)" \
  || fail "Unable to verify the installed Xcode version."
[ "$XCODE_VERSION" = $'Xcode 26.6\nBuild version 17F113' ] \
  || fail "This archive workflow requires Xcode 26.6 build 17F113."

require_safe_directory "$PROJECT_ROOT"
require_safe_directory "$BUILD_ROOT"
require_safe_directory "$GENERATED_ROOT"
XCODE_PROJECT="$GENERATED_ROOT/Tab Shelf/Tab Shelf.xcodeproj"
require_safe_directory "$XCODE_PROJECT"
require_safe_file "$XCODE_PROJECT/project.pbxproj"
PROJECT_COUNT="$(count_generated_projects)" \
  || fail "Unable to inspect generated Xcode projects."
[ "$PROJECT_COUNT" = "1" ] \
  || fail "Expected exactly one generated Xcode project."

if [ -e "$ARCHIVE_ROOT" ] || [ -L "$ARCHIVE_ROOT" ]; then
  require_safe_directory "$ARCHIVE_ROOT"
fi
[ ! -e "$ARCHIVE_PATH" ] && [ ! -L "$ARCHIVE_PATH" ] \
  || fail "The local archive already exists. Move it aside before archiving again."

npm run check:app-store

if [ ! -e "$ARCHIVE_ROOT" ] && [ ! -L "$ARCHIVE_ROOT" ]; then
  mkdir "$ARCHIVE_ROOT" || fail "Unable to create the local archive directory."
fi
require_safe_directory "$ARCHIVE_ROOT"
[ ! -e "$ARCHIVE_PATH" ] && [ ! -L "$ARCHIVE_PATH" ] \
  || fail "The local archive already exists. Move it aside before archiving again."

if ! DEVELOPER_DIR="$DEVELOPER_DIR_PATH" /usr/bin/xcodebuild \
  -project "$XCODE_PROJECT" \
  -scheme "Tab Shelf" \
  -configuration Release \
  -destination generic/platform=macOS \
  -archivePath "$ARCHIVE_PATH" \
  DEVELOPMENT_TEAM="$APPLE_TEAM_ID" \
  CODE_SIGN_STYLE=Automatic \
  archive >/dev/null 2>&1; then
  fail "Xcode could not create the local archive. Review signing in Xcode and try again."
fi

ARCHIVE_INFO="$ARCHIVE_PATH/Info.plist"
ARCHIVED_APP="$ARCHIVE_PATH/Products/Applications/Tab Shelf.app"
ARCHIVED_EXTENSION="$ARCHIVED_APP/Contents/PlugIns/Tab Shelf Extension.appex"
require_safe_directory "$ARCHIVE_PATH"
require_safe_directory "$ARCHIVED_APP"
require_safe_directory "$ARCHIVED_EXTENSION"
require_plist_value "$ARCHIVE_INFO" "ApplicationProperties:CFBundleIdentifier" "$EXPECTED_APP_IDENTIFIER"
require_plist_value "$ARCHIVE_INFO" "ApplicationProperties:CFBundleShortVersionString" "$EXPECTED_VERSION"
require_plist_value "$ARCHIVE_INFO" "ApplicationProperties:CFBundleVersion" "$EXPECTED_BUILD"
require_plist_value "$ARCHIVED_APP/Contents/Info.plist" "CFBundleIdentifier" "$EXPECTED_APP_IDENTIFIER"
require_plist_value "$ARCHIVED_APP/Contents/Info.plist" "CFBundleShortVersionString" "$EXPECTED_VERSION"
require_plist_value "$ARCHIVED_APP/Contents/Info.plist" "CFBundleVersion" "$EXPECTED_BUILD"
require_plist_value "$ARCHIVED_EXTENSION/Contents/Info.plist" "CFBundleIdentifier" "$EXPECTED_EXTENSION_IDENTIFIER"
require_plist_value "$ARCHIVED_EXTENSION/Contents/Info.plist" "CFBundleShortVersionString" "$EXPECTED_VERSION"
require_plist_value "$ARCHIVED_EXTENSION/Contents/Info.plist" "CFBundleVersion" "$EXPECTED_BUILD"

printf 'Tab Shelf local archive created:\n  %s\nOpen Xcode Organizer yourself to validate this archive; any later release action remains separate.\n' \
  "$ARCHIVE_PATH"
