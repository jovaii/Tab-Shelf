#!/bin/bash

set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
XCODE_APP="/Applications/Xcode.app"
DEVELOPER_DIR_PATH="/Applications/Xcode.app/Contents/Developer"
GENERATED_PROJECT="native/generated"
DERIVED_DATA="build/xcode-derived"
OUTPUT_APP="build/Tab Shelf.app"
OUTPUT_ZIP="dist/Tab-Shelf-1.0.0.zip"
OUTER_IDENTIFIER="com.jovaii.tabshelf"
EXTENSION_IDENTIFIER="com.jovaii.tabshelf.extension"
PLUGINKIT="/usr/bin/pluginkit"
LSREGISTER="/System/Library/Frameworks/CoreServices.framework/Versions/Current/Frameworks/LaunchServices.framework/Versions/Current/Support/lsregister"

fail() {
  printf 'Tab Shelf packaging stopped: %s\n' "$1" >&2
  exit 1
}

require_absent() {
  if [ -e "$1" ] || [ -L "$1" ]; then
    fail "$1 already exists. Move it aside and run the package command again."
  fi
}

count_paths() {
  awk 'NF { count += 1 } END { print count + 0 }'
}

resolve_development_team() {
  local identity_count certificate_subject detected_team
  if [ -n "${TAB_SHELF_DEVELOPMENT_TEAM:-}" ]; then
    detected_team="$TAB_SHELF_DEVELOPMENT_TEAM"
  else
    identity_count="$(/usr/bin/security find-identity -v -p codesigning \
      | awk '/"Apple Development:/ { count += 1 } END { print count + 0 }')"
    [ "$identity_count" -eq 1 ] \
      || fail "Expected exactly one valid Apple Development identity; found $identity_count. Resolve the identities in Xcode or set TAB_SHELF_DEVELOPMENT_TEAM."
    certificate_subject="$(/usr/bin/security find-certificate -c 'Apple Development' -p \
      | /usr/bin/openssl x509 -noout -subject -nameopt RFC2253)" \
      || fail "Unable to read the Apple Development certificate."
    detected_team="$(printf '%s\n' "$certificate_subject" \
      | sed -n 's/^subject=.*OU=\([^,]*\).*$/\1/p')"
  fi
  [[ "$detected_team" =~ ^[A-Z0-9]{10}$ ]] \
    || fail "The Apple Development Team ID is missing or invalid."
  printf '%s\n' "$detected_team"
}

single_project() {
  local project_list project_count
  project_list="$(find "$GENERATED_PROJECT" -type d -name '*.xcodeproj' -print)"
  project_count="$(printf '%s\n' "$project_list" | count_paths)"
  [ "$project_count" -eq 1 ] || fail "Expected exactly one generated Xcode project; found $project_count."
  printf '%s\n' "$project_list"
}

single_built_app() {
  local app_list app_count
  app_list="$(find "$DERIVED_DATA/Build/Products/Release" -type d -name 'Tab Shelf.app' -prune -print)"
  app_count="$(printf '%s\n' "$app_list" | count_paths)"
  [ "$app_count" -eq 1 ] || fail "Expected exactly one Release Tab Shelf.app; found $app_count."
  printf '%s\n' "$app_list"
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

unregister_build_app() {
  local app_path="$1"
  local extension_path="$app_path/Contents/PlugIns/Tab Shelf Extension.appex"

  if [ -d "$extension_path" ] && [ ! -L "$extension_path" ]; then
    "$PLUGINKIT" -r "$extension_path" >/dev/null 2>&1 || true
  fi
  if [ -d "$app_path" ] && [ ! -L "$app_path" ]; then
    "$LSREGISTER" -u "$app_path" >/dev/null 2>&1 || true
  fi
}

cleanup_build_registrations() {
  unregister_build_app "$PROJECT_ROOT/$DERIVED_DATA/Build/Products/Release/Tab Shelf.app"
  unregister_build_app "$PROJECT_ROOT/$OUTPUT_APP"
}

verify_no_build_registrations() {
  local registration_output registered_path
  registration_output="$("$PLUGINKIT" -mDvvv -i "$EXTENSION_IDENTIFIER" 2>&1)" \
    || fail "Unable to query all Safari extension registrations after packaging."

  while IFS= read -r registered_path; do
    case "$registered_path" in
      "$PROJECT_ROOT"/*)
        fail "Packaging left a Safari extension registered from the build directory: $registered_path"
        ;;
    esac
  done < <(printf '%s\n' "$registration_output" \
    | awk -F ' = ' '/^[[:space:]]*Path = / { print $2 }')
}

[ -d "$XCODE_APP" ] || fail "Full Xcode is required. Install Xcode, open it once to finish setup, then run this command again."
[ -d "$DEVELOPER_DIR_PATH" ] || fail "Full Xcode is incomplete. Open Xcode once to finish installing its components."

cd "$PROJECT_ROOT"
require_absent "$GENERATED_PROJECT"
require_absent "$DERIVED_DATA"
require_absent "$OUTPUT_APP"
require_absent "$OUTPUT_ZIP"
mkdir -p native build dist
trap cleanup_build_registrations EXIT

PACKAGER_ROOT="$(mktemp -d /private/tmp/tab-shelf-package.XXXXXX)" \
  || fail "Unable to create the isolated Xcode project directory."
case "$PACKAGER_ROOT" in
  /private/tmp/tab-shelf-package.*) ;;
  *) fail "The isolated Xcode project directory is outside /private/tmp." ;;
esac
[ -d "$PACKAGER_ROOT" ] && [ ! -L "$PACKAGER_ROOT" ] \
  || fail "The isolated Xcode project directory is unsafe."

DEVELOPER_DIR="$DEVELOPER_DIR_PATH" xcrun --find safari-web-extension-packager >/dev/null 2>&1 \
  || fail "Full Xcode does not provide safari-web-extension-packager. Update Xcode and run this command again."

DEVELOPER_DIR="$DEVELOPER_DIR_PATH" xcrun safari-web-extension-packager "$PROJECT_ROOT/extension" \
  --project-location "$PACKAGER_ROOT" \
  --app-name "Tab Shelf" \
  --bundle-identifier com.jovaii.tabshelf \
  --macos-only \
  --swift \
  --copy-resources \
  --no-open \
  --no-prompt

[ -d "$PACKAGER_ROOT/Tab Shelf" ] \
  || fail "The Safari packager did not generate the expected Tab Shelf project."
mv "$PACKAGER_ROOT" "$GENERATED_PROJECT"
node scripts/prepare-macos-project.mjs "$GENERATED_PROJECT"

XCODE_PROJECT="$(single_project)"
DEVELOPMENT_TEAM="$(resolve_development_team)"

DEVELOPER_DIR="$DEVELOPER_DIR_PATH" xcrun xcodebuild \
  -project "$XCODE_PROJECT" \
  -scheme "Tab Shelf" \
  -configuration Release \
  -derivedDataPath "$DERIVED_DATA" \
  -allowProvisioningUpdates \
  CODE_SIGNING_ALLOWED=YES \
  CODE_SIGN_STYLE=Automatic \
  DEVELOPMENT_TEAM="$DEVELOPMENT_TEAM" \
  REGISTER_WITH_LAUNCH_SERVICES=NO \
  build

BUILT_APP="$(single_built_app)"
unregister_build_app "$BUILT_APP"
/usr/bin/ditto "$BUILT_APP" "$OUTPUT_APP"
unregister_build_app "$OUTPUT_APP"

NESTED_EXTENSION="$(single_extension "$OUTPUT_APP")"
[ "$(bundle_identifier "$OUTPUT_APP")" = "$OUTER_IDENTIFIER" ] \
  || fail "The generated App bundle identifier is not $OUTER_IDENTIFIER."
[ "$(bundle_identifier "$NESTED_EXTENSION")" = "$EXTENSION_IDENTIFIER" ] \
  || fail "The generated Safari extension identifier is not $EXTENSION_IDENTIFIER."

/usr/bin/codesign --verify --strict "$NESTED_EXTENSION"
/usr/bin/codesign --verify --strict --deep "$OUTPUT_APP"

(
  cd "build"
  /usr/bin/ditto -c -k --sequesterRsrc --keepParent "Tab Shelf.app" "../dist/Tab-Shelf-1.0.0.zip"
)

cleanup_build_registrations
verify_no_build_registrations

printf 'Tab Shelf package created:\n  %s\n  %s\n' \
  "$PROJECT_ROOT/$OUTPUT_APP" \
  "$PROJECT_ROOT/$OUTPUT_ZIP"
