#!/bin/bash

archive_workflow_fail() {
  printf 'Tab Shelf App Store archive stopped: %s\n' "$1" >&2
  exit 1
}

archive_require_inside_repository() {
  local candidate="$1"
  case "$candidate" in
    "$ARCHIVE_PROJECT_ROOT"|"$ARCHIVE_PROJECT_ROOT"/*) ;;
    *) archive_workflow_fail "A required path is outside the repository." ;;
  esac
}

archive_require_safe_directory() {
  local candidate="$1" canonical
  archive_require_inside_repository "$candidate"
  [ -d "$candidate" ] || archive_workflow_fail "A required directory is missing."
  [ ! -L "$candidate" ] || archive_workflow_fail "A required directory must not be a symbolic link."
  canonical="$(cd -- "$candidate" && pwd -P)" \
    || archive_workflow_fail "Unable to verify a required directory."
  case "$canonical" in
    "$ARCHIVE_PROJECT_ROOT"|"$ARCHIVE_PROJECT_ROOT"/*) ;;
    *) archive_workflow_fail "A required path resolves outside the repository." ;;
  esac
  [ "$canonical" = "$candidate" ] \
    || archive_workflow_fail "A required directory must not cross a symbolic link."
}

archive_require_safe_file() {
  local candidate="$1" parent link_count
  archive_require_inside_repository "$candidate"
  parent="$("$ARCHIVE_TOOL_DIRNAME" -- "$candidate")" \
    || archive_workflow_fail "Unable to verify a required file."
  archive_require_safe_directory "$parent"
  [ -f "$candidate" ] || archive_workflow_fail "A required file is missing."
  [ ! -L "$candidate" ] || archive_workflow_fail "A required file must not be a symbolic link."
  link_count="$("$ARCHIVE_TOOL_STAT" -f '%l' "$candidate")" \
    || archive_workflow_fail "Unable to inspect a required file."
  [[ "$link_count" =~ ^[0-9]+$ ]] \
    || archive_workflow_fail "Unable to inspect a required file."
  [ "$link_count" -eq 1 ] || archive_workflow_fail "A required file must not be a hard link."
}

archive_directory_identity() {
  local candidate="$1" identity
  archive_require_safe_directory "$candidate"
  identity="$("$ARCHIVE_TOOL_STAT" -f '%d:%i:%HT' "$candidate")" \
    || archive_workflow_fail "Unable to inspect a required directory."
  [[ "$identity" =~ ^[0-9]+:[0-9]+:Directory$ ]] \
    || archive_workflow_fail "Unable to inspect a required directory."
  printf '%s\n' "$identity"
}

archive_require_same_directory() {
  local candidate="$1" expected="$2" current
  current="$(archive_directory_identity "$candidate")" \
    || archive_workflow_fail "Unable to revalidate a required directory."
  [ "$current" = "$expected" ] \
    || archive_workflow_fail "A required directory changed during archiving."
}

archive_ensure_safe_child_directory() {
  local parent="$1" candidate="$2" actual_parent
  archive_require_safe_directory "$parent"
  actual_parent="$("$ARCHIVE_TOOL_DIRNAME" -- "$candidate")" \
    || archive_workflow_fail "Unable to verify an archive directory."
  [ "$actual_parent" = "$parent" ] \
    || archive_workflow_fail "An archive directory is outside its validated parent."
  if [ ! -e "$candidate" ] && [ ! -L "$candidate" ]; then
    "$ARCHIVE_TOOL_MKDIR" -m 700 "$candidate" \
      || archive_workflow_fail "Unable to create the local archive directory."
  fi
  archive_require_safe_directory "$candidate"
}

archive_require_plist_value() {
  local plist="$1" key="$2" expected="$3" actual
  archive_require_safe_file "$plist"
  actual="$("$ARCHIVE_TOOL_PLIST_BUDDY" -c "Print :$key" "$plist" 2>/dev/null)" \
    || archive_workflow_fail "Archive identity verification failed."
  [ "$actual" = "$expected" ] \
    || archive_workflow_fail "Archive identity verification failed."
}

archive_count_generated_projects() {
  "$ARCHIVE_TOOL_FIND" "$ARCHIVE_GENERATED_ROOT" -type d -name '*.xcodeproj' -prune -print \
    | "$ARCHIVE_TOOL_AWK" 'END { print NR }'
}

archive_require_single_bundle() {
  local parent="$1" suffix="$2" expected="$3" candidate
  local -a matches=()
  archive_require_safe_directory "$parent"
  shopt -s nullglob
  for candidate in "$parent"/*"$suffix"; do
    [ -d "$candidate" ] && [ ! -L "$candidate" ] \
      || archive_workflow_fail "Archive bundle verification failed."
    archive_require_safe_directory "$candidate"
    matches+=("$candidate")
  done
  shopt -u nullglob
  [ "${#matches[@]}" -eq 1 ] \
    || archive_workflow_fail "Archive bundle verification failed."
  [ "${matches[0]}" = "$expected" ] \
    || archive_workflow_fail "Archive bundle verification failed."
  printf '%s\n' "${matches[0]}"
}

archive_release_lock() {
  local current
  [ "$ARCHIVE_LOCK_OWNED" -eq 1 ] || return 0
  [ -n "$ARCHIVE_LOCK_IDENTITY" ] || return 0
  [ -d "$ARCHIVE_LOCK" ] && [ ! -L "$ARCHIVE_LOCK" ] || return 0
  current="$("$ARCHIVE_TOOL_STAT" -f '%d:%i:%HT' "$ARCHIVE_LOCK" 2>/dev/null)" || return 0
  [ "$current" = "$ARCHIVE_LOCK_IDENTITY" ] || return 0
  "$ARCHIVE_TOOL_RMDIR" "$ARCHIVE_LOCK" >/dev/null 2>&1 || return 0
  ARCHIVE_LOCK_OWNED=0
}

archive_acquire_lock() {
  [ ! -e "$ARCHIVE_LOCK" ] && [ ! -L "$ARCHIVE_LOCK" ] \
    || archive_workflow_fail "Another local archive operation is already active."
  "$ARCHIVE_TOOL_MKDIR" -m 700 "$ARCHIVE_LOCK" \
    || archive_workflow_fail "Another local archive operation is already active."
  ARCHIVE_LOCK_IDENTITY="$(archive_directory_identity "$ARCHIVE_LOCK")" \
    || archive_workflow_fail "Unable to verify the local archive lock."
  ARCHIVE_LOCK_OWNED=1
  trap archive_release_lock EXIT
  trap 'exit 129' HUP
  trap 'exit 130' INT
  trap 'exit 143' TERM
}

archive_app_store_workflow() {
  [ "$#" -eq 14 ] || archive_workflow_fail "Archive workflow configuration is invalid."
  ARCHIVE_PROJECT_ROOT="$1"
  unset archive_team_id
  local archive_team_id="$2"
  unset APPLE_TEAM_ID ARCHIVE_TEAM_ID
  ARCHIVE_XCODE_APP="$3"
  ARCHIVE_DEVELOPER_DIR="$4"
  ARCHIVE_TOOL_NODE="$5"
  ARCHIVE_TOOL_XCRUN="$6"
  ARCHIVE_TOOL_XCODEBUILD="$7"
  ARCHIVE_TOOL_STAT="$8"
  ARCHIVE_TOOL_FIND="$9"
  ARCHIVE_TOOL_AWK="${10}"
  ARCHIVE_TOOL_PLIST_BUDDY="${11}"
  ARCHIVE_TOOL_MKDIR="${12}"
  ARCHIVE_TOOL_RMDIR="${13}"
  ARCHIVE_TOOL_DIRNAME="${14}"
  ARCHIVE_GENERATED_ROOT="$ARCHIVE_PROJECT_ROOT/native/generated"
  ARCHIVE_BUILD_ROOT="$ARCHIVE_PROJECT_ROOT/build"
  ARCHIVE_ROOT="$ARCHIVE_BUILD_ROOT/app-store"
  ARCHIVE_PATH="$ARCHIVE_ROOT/Tab Shelf.xcarchive"
  ARCHIVE_LOCK="$ARCHIVE_ROOT/.tab-shelf-archive.lock"
  ARCHIVE_LOCK_OWNED=0
  ARCHIVE_LOCK_IDENTITY=""
  local archive_parent_identity project_count xcode_project archive_info archive_applications
  local archived_app archived_extension xcode_status xcode_version

  [ -d "$ARCHIVE_XCODE_APP" ] \
    || archive_workflow_fail "Full Xcode is required. Install Xcode and complete its first-launch setup."
  [ -d "$ARCHIVE_DEVELOPER_DIR" ] \
    || archive_workflow_fail "Full Xcode is incomplete. Complete its first-launch setup."
  DEVELOPER_DIR="$ARCHIVE_DEVELOPER_DIR" "$ARCHIVE_TOOL_XCRUN" --find xcodebuild >/dev/null 2>&1 \
    || archive_workflow_fail "Full Xcode does not provide xcodebuild."
  xcode_version="$(DEVELOPER_DIR="$ARCHIVE_DEVELOPER_DIR" "$ARCHIVE_TOOL_XCODEBUILD" -version 2>/dev/null)" \
    || archive_workflow_fail "Unable to verify the installed Xcode version."
  [ "$xcode_version" = $'Xcode 26.6\nBuild version 17F113' ] \
    || archive_workflow_fail "This archive workflow requires Xcode 26.6 build 17F113."

  archive_require_safe_directory "$ARCHIVE_PROJECT_ROOT"
  archive_ensure_safe_child_directory "$ARCHIVE_PROJECT_ROOT" "$ARCHIVE_BUILD_ROOT"
  archive_require_safe_directory "$ARCHIVE_GENERATED_ROOT"
  xcode_project="$ARCHIVE_GENERATED_ROOT/Tab Shelf/Tab Shelf.xcodeproj"
  archive_require_safe_directory "$xcode_project"
  archive_require_safe_file "$xcode_project/project.pbxproj"
  project_count="$(archive_count_generated_projects)" \
    || archive_workflow_fail "Unable to inspect generated Xcode projects."
  [ "$project_count" = "1" ] \
    || archive_workflow_fail "Expected exactly one generated Xcode project."

  cd -- "$ARCHIVE_PROJECT_ROOT" || archive_workflow_fail "Unable to enter the repository root."
  "$ARCHIVE_TOOL_NODE" "$ARCHIVE_PROJECT_ROOT/scripts/check-app-store-readiness.mjs" --generated native/generated

  archive_ensure_safe_child_directory "$ARCHIVE_BUILD_ROOT" "$ARCHIVE_ROOT"
  archive_parent_identity="$(archive_directory_identity "$ARCHIVE_ROOT")" \
    || archive_workflow_fail "Unable to verify the local archive directory."
  [ ! -e "$ARCHIVE_PATH" ] && [ ! -L "$ARCHIVE_PATH" ] \
    || archive_workflow_fail "The local archive already exists. Move it aside before archiving again."
  archive_acquire_lock
  archive_require_same_directory "$ARCHIVE_ROOT" "$archive_parent_identity"
  archive_require_same_directory "$ARCHIVE_LOCK" "$ARCHIVE_LOCK_IDENTITY"
  [ ! -e "$ARCHIVE_PATH" ] && [ ! -L "$ARCHIVE_PATH" ] \
    || archive_workflow_fail "The local archive already exists. Move it aside before archiving again."

  # Shell-level identity checks narrow races; a same-user filesystem adversary can still race after this revalidation.
  if DEVELOPER_DIR="$ARCHIVE_DEVELOPER_DIR" "$ARCHIVE_TOOL_XCODEBUILD" \
    -project "$xcode_project" \
    -scheme "Tab Shelf" \
    -configuration Release \
    -destination generic/platform=macOS \
    -archivePath "$ARCHIVE_PATH" \
    DEVELOPMENT_TEAM="$archive_team_id" \
    CODE_SIGN_STYLE=Automatic \
    archive >/dev/null 2>&1; then
    :
  else
    xcode_status=$?
    printf 'Tab Shelf App Store archive stopped: Xcode could not create the local archive.\n' >&2
    exit "$xcode_status"
  fi

  archive_info="$ARCHIVE_PATH/Info.plist"
  archive_applications="$ARCHIVE_PATH/Products/Applications"
  archive_require_safe_directory "$ARCHIVE_PATH"
  archive_require_plist_value "$archive_info" "ApplicationProperties:CFBundleIdentifier" "com.jovaii.tabshelf"
  archive_require_plist_value "$archive_info" "ApplicationProperties:CFBundleShortVersionString" "1.0.0"
  archive_require_plist_value "$archive_info" "ApplicationProperties:CFBundleVersion" "1"
  archived_app="$(archive_require_single_bundle "$archive_applications" '.app' "$archive_applications/Tab Shelf.app")" \
    || archive_workflow_fail "Archive bundle verification failed."
  archived_extension="$(archive_require_single_bundle "$archived_app/Contents/PlugIns" '.appex' "$archived_app/Contents/PlugIns/Tab Shelf Extension.appex")" \
    || archive_workflow_fail "Archive bundle verification failed."
  archive_require_plist_value "$archived_app/Contents/Info.plist" "CFBundleIdentifier" "com.jovaii.tabshelf"
  archive_require_plist_value "$archived_app/Contents/Info.plist" "CFBundleShortVersionString" "1.0.0"
  archive_require_plist_value "$archived_app/Contents/Info.plist" "CFBundleVersion" "1"
  archive_require_plist_value "$archived_extension/Contents/Info.plist" "CFBundleIdentifier" "com.jovaii.tabshelf.extension"
  archive_require_plist_value "$archived_extension/Contents/Info.plist" "CFBundleShortVersionString" "1.0.0"
  archive_require_plist_value "$archived_extension/Contents/Info.plist" "CFBundleVersion" "1"

  printf 'Tab Shelf local archive created:\n  %s\nOpen Xcode Organizer yourself to validate this archive; any later release action remains separate.\n' \
    "$ARCHIVE_PATH"
}
