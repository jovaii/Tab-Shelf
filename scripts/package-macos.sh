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

[ -d "$XCODE_APP" ] || fail "Full Xcode is required. Install Xcode, open it once to finish setup, then run this command again."
[ -d "$DEVELOPER_DIR_PATH" ] || fail "Full Xcode is incomplete. Open Xcode once to finish installing its components."

cd "$PROJECT_ROOT"
require_absent "$GENERATED_PROJECT"
require_absent "$DERIVED_DATA"
require_absent "$OUTPUT_APP"
require_absent "$OUTPUT_ZIP"
mkdir -p native build dist

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

DEVELOPER_DIR="$DEVELOPER_DIR_PATH" xcrun xcodebuild \
  -project "$XCODE_PROJECT" \
  -scheme "Tab Shelf" \
  -configuration Release \
  -derivedDataPath "$DERIVED_DATA" \
  CODE_SIGNING_ALLOWED=YES \
  CODE_SIGN_IDENTITY=- \
  REGISTER_WITH_LAUNCH_SERVICES=NO \
  build

BUILT_APP="$(single_built_app)"
"/System/Library/Frameworks/CoreServices.framework/Versions/Current/Frameworks/LaunchServices.framework/Versions/Current/Support/lsregister" -u "$BUILT_APP"
/usr/bin/ditto "$BUILT_APP" "$OUTPUT_APP"

NESTED_EXTENSION="$(single_extension "$OUTPUT_APP")"
[ "$(bundle_identifier "$OUTPUT_APP")" = "$OUTER_IDENTIFIER" ] \
  || fail "The generated App bundle identifier is not $OUTER_IDENTIFIER."
[ "$(bundle_identifier "$NESTED_EXTENSION")" = "$EXTENSION_IDENTIFIER" ] \
  || fail "The generated Safari extension identifier is not $EXTENSION_IDENTIFIER."

/usr/bin/codesign --force --sign - "$OUTPUT_APP"
/usr/bin/codesign --verify --strict "$NESTED_EXTENSION"
/usr/bin/codesign --verify --strict --deep "$OUTPUT_APP"

(
  cd "build"
  /usr/bin/ditto -c -k --sequesterRsrc --keepParent "Tab Shelf.app" "../dist/Tab-Shelf-1.0.0.zip"
)

printf 'Tab Shelf package created:\n  %s\n  %s\n' \
  "$PROJECT_ROOT/$OUTPUT_APP" \
  "$PROJECT_ROOT/$OUTPUT_ZIP"
