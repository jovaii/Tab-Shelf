#!/bin/bash

set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
SOURCE_APP="$PROJECT_ROOT/build/Tab Shelf.app"
INSTALL_TARGET="/Applications/Tab Shelf.app"
OUTER_IDENTIFIER="com.jovaii.tabshelf"
EXTENSION_IDENTIFIER="com.jovaii.tabshelf.extension"
EXPECTED_EXTENSION_PATH="$INSTALL_TARGET/Contents/PlugIns/Tab Shelf Extension.appex"
LSREGISTER="/System/Library/Frameworks/CoreServices.framework/Versions/Current/Frameworks/LaunchServices.framework/Versions/Current/Support/lsregister"
PLUGINKIT="/usr/bin/pluginkit"
RECOVERY_ROOT="$PROJECT_ROOT/build/install-recovery"
BACKUP_ROOT="$RECOVERY_ROOT/backups"
FAILED_ROOT="$RECOVERY_ROOT/failures"
TIMESTAMP="$(date '+%Y%m%d-%H%M%S')"
BACKUP_TARGET="$BACKUP_ROOT/Tab Shelf-${TIMESTAMP}.app"
FAILED_TARGET="$FAILED_ROOT/Tab Shelf-${TIMESTAMP}.app"
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

prepare_recovery_directories() {
  local resolved_recovery
  [ ! -L "$PROJECT_ROOT/build" ] \
    || fail "Refusing a symbolic-link build directory."
  mkdir -p "$BACKUP_ROOT" "$FAILED_ROOT"
  for recovery_path in "$RECOVERY_ROOT" "$BACKUP_ROOT" "$FAILED_ROOT"; do
    [ -d "$recovery_path" ] && [ ! -L "$recovery_path" ] \
      || fail "The recovery directory is unsafe: $recovery_path"
  done
  resolved_recovery="$(cd "$RECOVERY_ROOT" && pwd -P)"
  [ "$resolved_recovery" = "$PROJECT_ROOT/build/install-recovery" ] \
    || fail "The recovery directory resolved outside the project build directory."
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

unregister_app() {
  local app_path="$1" extension_path
  [ -d "$app_path" ] || return 0
  [ ! -L "$app_path" ] \
    || fail "Refusing to unregister a symbolic-link App path: $app_path."
  extension_path="$app_path/Contents/PlugIns/Tab Shelf Extension.appex"
  if [ -d "$extension_path" ] && [ ! -L "$extension_path" ]; then
    "$PLUGINKIT" -r "$extension_path" >/dev/null 2>&1 || true
  fi
  "$LSREGISTER" -u "$app_path" >/dev/null 2>&1 || true
}

register_app() {
  local app_path="$1" extension_path
  extension_path="$(single_extension "$app_path")"
  "$LSREGISTER" -f -R -trusted "$app_path"
  "$PLUGINKIT" -a "$extension_path"
  "$PLUGINKIT" -e use -i "$EXTENSION_IDENTIFIER"
}

verify_single_registration() {
  local registration_output registration_paths registration_count
  registration_output="$("$PLUGINKIT" -mDvvv -i "$EXTENSION_IDENTIFIER")"
  registration_paths="$(printf '%s\n' "$registration_output" \
    | sed -n 's/^[[:space:]]*Path = //p')"
  registration_count="$(printf '%s\n' "$registration_paths" | count_paths)"
  if [ "$registration_count" -ne 1 ]; then
    printf '%s\n' "$registration_paths" >&2
    fail "Expected exactly one registered Safari extension; found $registration_count."
  fi
  [ "$registration_paths" = "$EXPECTED_EXTENSION_PATH" ] \
    || fail "The registered Safari extension is not the installed Tab Shelf extension: $registration_paths"
}

rollback() {
  local original_status=$?
  trap - EXIT
  set +e
  if [ "$INSTALL_COMPLETE" -eq 0 ]; then
    if [ -L "$INSTALL_TARGET" ]; then
      printf 'Rollback stopped because the install target became a symbolic link. Restore the backup manually: %s\n' "$BACKUP_TARGET" >&2
    elif [ -e "$INSTALL_TARGET" ]; then
      "$PLUGINKIT" -r "$EXPECTED_EXTENSION_PATH" >/dev/null 2>&1 || true
      "$LSREGISTER" -u "$INSTALL_TARGET" >/dev/null 2>&1 || true
      mv "$INSTALL_TARGET" "$FAILED_TARGET"
    fi
    if [ "$BACKUP_CREATED" -eq 1 ] && [ -d "$BACKUP_TARGET" ] && [ ! -e "$INSTALL_TARGET" ]; then
      mv "$BACKUP_TARGET" "$INSTALL_TARGET"
      "$LSREGISTER" -f -R -trusted "$INSTALL_TARGET" >/dev/null 2>&1 || true
      "$PLUGINKIT" -a "$EXPECTED_EXTENSION_PATH" >/dev/null 2>&1 || true
      "$PLUGINKIT" -e use -i "$EXTENSION_IDENTIFIER" >/dev/null 2>&1 || true
    fi
  fi
  exit "$original_status"
}

verify_app "$SOURCE_APP"
prepare_recovery_directories

if [ -L "$INSTALL_TARGET" ]; then
  fail "Refusing to replace a symbolic link at $INSTALL_TARGET."
fi
if [ -e "$INSTALL_TARGET" ] && [ ! -d "$INSTALL_TARGET" ]; then
  fail "The install target exists but is not an App directory."
fi
if [ -d "$INSTALL_TARGET" ]; then
  verify_app "$INSTALL_TARGET"
fi
if [ -e "$BACKUP_TARGET" ] || [ -L "$BACKUP_TARGET" ] \
  || [ -e "$FAILED_TARGET" ] || [ -L "$FAILED_TARGET" ]; then
  fail "A timestamped backup or failed target already exists. Wait one second and run again."
fi

if [ -d "$INSTALL_TARGET" ]; then
  unregister_app "$INSTALL_TARGET"
  mv "$INSTALL_TARGET" "$BACKUP_TARGET"
  BACKUP_CREATED=1
fi

trap rollback EXIT
/usr/bin/ditto "$SOURCE_APP" "$INSTALL_TARGET"
verify_app "$INSTALL_TARGET"
unregister_app "$SOURCE_APP"
register_app "$INSTALL_TARGET"
verify_single_registration
INSTALL_COMPLETE=1
trap - EXIT

/usr/bin/open "$INSTALL_TARGET"
printf 'Tab Shelf installed at %s\n' "$INSTALL_TARGET"
if [ "$BACKUP_CREATED" -eq 1 ]; then
  printf 'Previous installation retained at %s\n' "$BACKUP_TARGET"
fi
