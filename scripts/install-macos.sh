#!/bin/bash

set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
SOURCE_APP="$PROJECT_ROOT/build/Tab Shelf.app"
INSTALL_TARGET="/Applications/Tab Shelf.app"
OUTER_IDENTIFIER="com.jovaii.tabshelf"
EXTENSION_IDENTIFIER="com.jovaii.tabshelf.extension"
TIMESTAMP="$(date '+%Y%m%d-%H%M%S')"
BACKUP_TARGET="/Applications/Tab Shelf.app.backup-${TIMESTAMP}"
FAILED_TARGET="/Applications/Tab Shelf.app.failed-${TIMESTAMP}"
BACKUP_CREATED=0
INSTALL_COMPLETE=0

fail() {
  printf 'Tab Shelf installation stopped: %s\n' "$1" >&2
  exit 1
}

count_paths() {
  awk 'NF { count += 1 } END { print count + 0 }'
}

single_extension() {
  local app_path="$1" extension_list extension_count
  extension_list="$(find "$app_path/Contents/PlugIns" -maxdepth 1 -type d -name '*.appex' -print)"
  extension_count="$(printf '%s\n' "$extension_list" | count_paths)"
  [ "$extension_count" -eq 1 ] || fail "Expected exactly one Safari extension bundle; found $extension_count."
  printf '%s\n' "$extension_list"
}

bundle_identifier() {
  /usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' "$1/Contents/Info.plist"
}

verify_app() {
  local app_path="$1" nested_extension
  [ -d "$app_path" ] || fail "Expected an App directory at $app_path."
  [ ! -L "$app_path" ] || fail "Refusing a symbolic-link App path: $app_path."
  [ "$(bundle_identifier "$app_path")" = "$OUTER_IDENTIFIER" ] \
    || fail "The App identifier is not $OUTER_IDENTIFIER."
  nested_extension="$(single_extension "$app_path")"
  [ "$(bundle_identifier "$nested_extension")" = "$EXTENSION_IDENTIFIER" ] \
    || fail "The Safari extension identifier is not $EXTENSION_IDENTIFIER."
  /usr/bin/codesign --verify --strict "$nested_extension"
  /usr/bin/codesign --verify --strict --deep "$app_path"
}

rollback() {
  local original_status=$?
  if [ "$INSTALL_COMPLETE" -eq 0 ]; then
    if [ -L "$INSTALL_TARGET" ]; then
      printf 'Rollback stopped because the install target became a symbolic link. Restore the backup manually: %s\n' "$BACKUP_TARGET" >&2
    elif [ -e "$INSTALL_TARGET" ]; then
      mv "$INSTALL_TARGET" "$FAILED_TARGET"
    fi
    if [ "$BACKUP_CREATED" -eq 1 ] && [ -d "$BACKUP_TARGET" ] && [ ! -e "$INSTALL_TARGET" ]; then
      mv "$BACKUP_TARGET" "$INSTALL_TARGET"
    fi
  fi
  exit "$original_status"
}

verify_app "$SOURCE_APP"

if [ -L "$INSTALL_TARGET" ]; then
  fail "Refusing to replace a symbolic link at $INSTALL_TARGET."
fi
if [ -e "$INSTALL_TARGET" ] && [ ! -d "$INSTALL_TARGET" ]; then
  fail "The install target exists but is not an App directory."
fi
if [ -e "$BACKUP_TARGET" ] || [ -L "$BACKUP_TARGET" ] \
  || [ -e "$FAILED_TARGET" ] || [ -L "$FAILED_TARGET" ]; then
  fail "A timestamped backup or failed target already exists. Wait one second and run again."
fi

if [ -d "$INSTALL_TARGET" ]; then
  mv "$INSTALL_TARGET" "$BACKUP_TARGET"
  BACKUP_CREATED=1
fi

trap rollback EXIT
/usr/bin/ditto "$SOURCE_APP" "$INSTALL_TARGET"
verify_app "$INSTALL_TARGET"
INSTALL_COMPLETE=1
trap - EXIT

/usr/bin/open "$INSTALL_TARGET"
printf 'Tab Shelf installed at %s\n' "$INSTALL_TARGET"
if [ "$BACKUP_CREATED" -eq 1 ]; then
  printf 'Previous installation retained at %s\n' "$BACKUP_TARGET"
fi
