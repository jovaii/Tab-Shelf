import assert from "node:assert/strict";
import {
  chmodSync,
  cpSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

function source(path) {
  return readFileSync(path, "utf8");
}

test("archive path signs for the enrolled team but never uploads", () => {
  const script = source("scripts/archive-app-store.sh");
  const workflow = source("scripts/archive-app-store-workflow.sh");

  assert.match(script, /set -euo pipefail/u);
  assert.match(script, /APPLE_TEAM_ID/u);
  assert.match(script, /\^\[A-Z0-9\]\{10\}\$/u);
  assert.match(script, /PATH="\/usr\/local\/bin:\/opt\/homebrew\/bin:\/usr\/bin:\/bin:\/usr\/sbin:\/sbin:\/usr\/libexec"/u);
  assert.match(script, /XCODE_APP="\/Applications\/Xcode\.app"/u);
  assert.match(script, /DEVELOPER_DIR_PATH="\/Applications\/Xcode\.app\/Contents\/Developer"/u);
  assert.match(script, /unset ARCHIVE_TEAM_ID/u);
  assert.match(script, /unset CDPATH/u);
  assert.match(script, /must not be a symbolic link/u);
  assert.ok(script.indexOf("unset CDPATH") < script.indexOf("SCRIPT_DIRECTORY_INPUT"));
  assert.ok(script.indexOf("unset ARCHIVE_TEAM_ID") < script.indexOf('ARCHIVE_TEAM_ID="${APPLE_TEAM_ID:-}"'));
  const lowerTeamIdUnset = workflow.indexOf("unset archive_team_id");
  const lowerTeamIdAssignment = workflow.indexOf('local archive_team_id="$2"');
  assert.notEqual(lowerTeamIdUnset, -1);
  assert.notEqual(lowerTeamIdAssignment, -1);
  assert.ok(lowerTeamIdUnset < lowerTeamIdAssignment);
  assert.doesNotMatch(script, /TAB_SHELF_XCODE|TAB_SHELF_DEVELOPER/u);
  assert.match(script, /\/usr\/bin\/xcrun/u);
  assert.match(script, /\/usr\/bin\/xcodebuild/u);
  assert.match(script, /\/usr\/bin\/stat/u);
  assert.match(script, /\/usr\/bin\/find/u);
  assert.match(script, /\/usr\/bin\/awk/u);
  assert.match(script, /\/usr\/libexec\/PlistBuddy/u);
  assert.match(script, /\/bin\/mkdir/u);
  assert.match(script, /\/bin\/rmdir/u);
  assert.match(workflow, /check-app-store-readiness\.mjs/u);
  assert.match(workflow, /-configuration Release/u);
  assert.match(workflow, /-destination generic\/platform=macOS/u);
  assert.match(workflow, /-archivePath/u);
  assert.match(workflow, /CODE_SIGN_STYLE=Automatic/u);
  assert.match(workflow, /DEVELOPMENT_TEAM="\$archive_team_id"/u);
  assert.match(workflow, /Xcode 26\.6/u);
  assert.match(workflow, /Build version 17F113/u);
  assert.doesNotMatch(script, /notarytool|altool|upload|exportArchive|rm\s+-[a-z]*r/iu);
  assert.doesNotMatch(script, /^\s*open\s/mu);
});

test("archive contract verifies the sealed archive identity without replacing an archive", () => {
  const script = source("scripts/archive-app-store-workflow.sh");

  assert.match(script, /Tab Shelf\.xcarchive/u);
  assert.match(script, /already exists/u);
  assert.match(script, /Info\.plist/u);
  assert.match(script, /CFBundleIdentifier/u);
  assert.match(script, /CFBundleShortVersionString/u);
  assert.match(script, /CFBundleVersion/u);
  assert.match(script, /com\.jovaii\.tabshelf\.extension/u);
  assert.match(script, /must not be a hard link/u);
  assert.match(script, /must not be a symbolic link/u);
});

test("package command exposes a local archive path and ignores local archives", () => {
  const manifest = JSON.parse(source("package.json"));
  const ignore = source(".gitignore");

  assert.equal(manifest.scripts["archive:app-store"], "bash scripts/archive-app-store.sh");
  assert.match(ignore, /^\*\.xcarchive\/$/mu);
  assert.match(ignore, /^build\/app-store\/$/mu);
});

function write(path, contents, mode) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, contents);
  if (mode !== undefined) chmodSync(path, mode);
}

function fakeTooling(root) {
  const bin = join(root, "fake-bin");
  const log = join(root, "tool.log");
  mkdirSync(bin, { recursive: true });
  const xcodeArgv = join(root, "xcodebuild-argv.bin");
  write(join(bin, "node"), `#!/bin/bash
printf 'node\\n' >> "$TAB_SHELF_TEST_LOG"
[ -z "\${APPLE_TEAM_ID+x}" ] && [ -z "\${ARCHIVE_TEAM_ID+x}" ] && [ -z "\${archive_team_id+x}" ] || exit 94
[ "$1" = "$TAB_SHELF_TEST_ROOT/scripts/check-app-store-readiness.mjs" ] || exit 95
[ "$2" = "--generated" ] || exit 95
[ "$3" = "native/generated" ] || exit 95
exit 0
`, 0o755);
  write(join(bin, "xcrun"), `#!/bin/bash
printf 'xcrun\\n' >> "$TAB_SHELF_TEST_LOG"
[ -z "\${APPLE_TEAM_ID+x}" ] && [ -z "\${ARCHIVE_TEAM_ID+x}" ] && [ -z "\${archive_team_id+x}" ] || exit 94
exit 0
`, 0o755);
  write(join(bin, "mkdir"), `#!/bin/bash
last=""
for argument in "$@"; do last="$argument"; done
if [ "\${TAB_SHELF_LATE_TARGET:-0}" = "1" ]; then
  case "$last" in
    */.tab-shelf-archive.lock)
      /bin/mkdir "$@" || exit $?
      : > "$TAB_SHELF_TEST_ARCHIVE_PATH"
      exit 0
      ;;
  esac
fi
exec /bin/mkdir "$@"
`, 0o755);
  write(join(bin, "xcodebuild"), `#!/bin/bash
[ -z "\${APPLE_TEAM_ID+x}" ] && [ -z "\${ARCHIVE_TEAM_ID+x}" ] && [ -z "\${archive_team_id+x}" ] || exit 94
if [ "$1" = "-version" ]; then
  printf 'Xcode 26.6\\nBuild version 17F113\\n'
  exit 0
fi
arguments=" $* "
for expected in " -scheme Tab Shelf " " -configuration Release " " -destination generic/platform=macOS " " DEVELOPMENT_TEAM=ABCDEFGHIJ " " CODE_SIGN_STYLE=Automatic "; do
  case "$arguments" in
    *"$expected"*) ;;
    *) printf 'unsafe xcodebuild arguments\\n' >&2; exit 96 ;;
  esac
done
printf 'xcodebuild\\n' >> "$TAB_SHELF_TEST_LOG"
printf '%s\\0' "$@" > "$TAB_SHELF_TEST_XCODE_ARGV"
if [ "\${TAB_SHELF_XCODE_STATUS:-0}" != "0" ]; then
  printf 'TOP_SECRET_TEAM=ABCDEFGHIJ /private/unsafe/path\\n' >&2
  exit "$TAB_SHELF_XCODE_STATUS"
fi
archive_path=""
while [ "$#" -gt 0 ]; do
  if [ "$1" = "-archivePath" ]; then
    archive_path="$2"
    shift 2
  else
    shift
  fi
done
[ -n "$archive_path" ] || exit 97
case "\${TAB_SHELF_BUNDLE_MODE:-one}" in
  zero-app) mkdir -p "$archive_path/Products/Applications" ;;
  multi-app)
    mkdir -p "$archive_path/Products/Applications/Tab Shelf.app/Contents/PlugIns/Tab Shelf Extension.appex/Contents"
    mkdir -p "$archive_path/Products/Applications/Extra.app/Contents"
    ;;
  zero-extension) mkdir -p "$archive_path/Products/Applications/Tab Shelf.app/Contents/PlugIns" ;;
  missing-plugins) mkdir -p "$archive_path/Products/Applications/Tab Shelf.app/Contents" ;;
  symlink-app)
    mkdir -p "$archive_path/Products/Applications/Other.app/Contents/PlugIns/Tab Shelf Extension.appex/Contents"
    ln -s "$archive_path/Products/Applications/Other.app" "$archive_path/Products/Applications/Tab Shelf.app"
    ;;
  symlink-extension)
    mkdir -p "$archive_path/Products/Applications/Tab Shelf.app/Contents/PlugIns/Other.appex/Contents"
    ln -s "$archive_path/Products/Applications/Tab Shelf.app/Contents/PlugIns/Other.appex" "$archive_path/Products/Applications/Tab Shelf.app/Contents/PlugIns/Tab Shelf Extension.appex"
    ;;
  multi-extension)
    mkdir -p "$archive_path/Products/Applications/Tab Shelf.app/Contents/PlugIns/Tab Shelf Extension.appex/Contents"
    mkdir -p "$archive_path/Products/Applications/Tab Shelf.app/Contents/PlugIns/Extra.appex/Contents"
    ;;
  *) mkdir -p "$archive_path/Products/Applications/Tab Shelf.app/Contents/PlugIns/Tab Shelf Extension.appex/Contents" ;;
esac
if [ "\${TAB_SHELF_BUNDLE_MODE:-one}" != "zero-app" ]; then
  app="$archive_path/Products/Applications/Tab Shelf.app"
  if [ -d "$app" ]; then
    mkdir -p "$app/Contents"
    printf 'CFBundleIdentifier=com.jovaii.tabshelf\\nCFBundleShortVersionString=1.0.0\\nCFBundleVersion=1\\n' > "$app/Contents/Info.plist"
    if [ -d "$app/Contents/PlugIns/Tab Shelf Extension.appex" ]; then
      printf 'CFBundleIdentifier=com.jovaii.tabshelf.extension\\nCFBundleShortVersionString=1.0.0\\nCFBundleVersion=1\\n' > "$app/Contents/PlugIns/Tab Shelf Extension.appex/Contents/Info.plist"
    fi
  fi
fi
printf 'ApplicationProperties:CFBundleIdentifier=com.jovaii.tabshelf\\nApplicationProperties:CFBundleShortVersionString=1.0.0\\nApplicationProperties:CFBundleVersion=1\\n' > "$archive_path/Info.plist"
if [ "\${TAB_SHELF_BUNDLE_MODE:-one}" = "hardlink-app-info" ]; then
  cp "$app/Contents/Info.plist" "$archive_path/app-info-copy.plist"
  rm "$app/Contents/Info.plist"
  ln "$archive_path/app-info-copy.plist" "$app/Contents/Info.plist"
fi
`, 0o755);
  write(join(bin, "PlistBuddy"), `#!/bin/bash
key="\${2#Print :}"
/usr/bin/awk -F= -v key="$key" '$1 == key { print substr($0, length(key) + 2); found = 1 } END { exit found ? 0 : 1 }' "$3"
`, 0o755);
  return { bin, log, xcodeArgv };
}

function makeArchiveFixture(t) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "tab-shelf-archive-")));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  cpSync("scripts/archive-app-store.sh", join(root, "scripts/archive-app-store.sh"));
  cpSync("scripts/archive-app-store-workflow.sh", join(root, "scripts/archive-app-store-workflow.sh"));
  write(join(root, "native/generated/Tab Shelf/Tab Shelf.xcodeproj/project.pbxproj"), "prepared project\n");
  const xcodeApp = join(root, "Fake Xcode.app");
  const developerDir = join(xcodeApp, "Contents/Developer");
  mkdirSync(developerDir, { recursive: true });
  const tooling = fakeTooling(root);
  return {
    root,
    xcodeApp,
    developerDir,
    ...tooling,
    archiveRoot: join(root, "build/app-store"),
    archivePath: join(root, "build/app-store/Tab Shelf.xcarchive"),
  };
}

function workflowArguments(fixture) {
  return [
    fixture.root,
    "ABCDEFGHIJ",
    fixture.xcodeApp,
    fixture.developerDir,
    join(fixture.bin, "node"),
    join(fixture.bin, "xcrun"),
    join(fixture.bin, "xcodebuild"),
    "/usr/bin/stat",
    "/usr/bin/find",
    "/usr/bin/awk",
    join(fixture.bin, "PlistBuddy"),
    join(fixture.bin, "mkdir"),
    "/bin/rmdir",
    "/usr/bin/dirname",
  ];
}

function runArchive(fixture, overrides = {}) {
  return spawnSync("/bin/bash", [
    "-c",
    'source "$1"; shift; archive_app_store_workflow "$@"',
    "archive-workflow",
    join(fixture.root, "scripts/archive-app-store-workflow.sh"),
    ...workflowArguments(fixture),
  ], {
    cwd: fixture.root,
    encoding: "utf8",
    env: {
      ...process.env,
      PATH: `${fixture.bin}:${process.env.PATH}`,
      APPLE_TEAM_ID: "ABCDEFGHIJ",
      ARCHIVE_TEAM_ID: "inherited-team-id",
      archive_team_id: "inherited-lowercase-team-id",
      TAB_SHELF_TEST_ROOT: fixture.root,
      TAB_SHELF_TEST_LOG: fixture.log,
      TAB_SHELF_TEST_XCODE_ARGV: fixture.xcodeArgv,
      TAB_SHELF_TEST_ARCHIVE_PATH: fixture.archivePath,
      ...overrides,
    },
  });
}

function runPublicArchive(fixture, overrides = {}) {
  return spawnSync("/bin/bash", ["scripts/archive-app-store.sh"], {
    cwd: fixture.root,
    encoding: "utf8",
    env: {
      ...process.env,
      PATH: fixture.bin,
      APPLE_TEAM_ID: "ABCDEFGHIJ",
      ARCHIVE_TEAM_ID: "inherited-team-id",
      archive_team_id: "inherited-lowercase-team-id",
      ...overrides,
    },
  });
}

function xcodeArguments(fixture) {
  const bytes = readFileSync(fixture.xcodeArgv);
  const values = bytes.toString("utf8").split("\0");
  assert.equal(values.pop(), "");
  return values;
}

function calls(fixture) {
  try {
    return readFileSync(fixture.log, "utf8").trim().split("\n").filter(Boolean);
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
}

test("archive behavior creates a clean build parent and verifies one sealed bundle", (t) => {
  const fixture = makeArchiveFixture(t);
  const result = runArchive(fixture);

  assert.equal(result.status, 0, `${result.stderr}\n${calls(fixture).join(",")}`);
  assert.deepEqual(calls(fixture), ["xcrun", "node", "xcodebuild"]);
  assert.deepEqual(xcodeArguments(fixture), [
    "-project", join(fixture.root, "native/generated/Tab Shelf/Tab Shelf.xcodeproj"),
    "-scheme", "Tab Shelf",
    "-configuration", "Release",
    "-destination", "generic/platform=macOS",
    "-archivePath", fixture.archivePath,
    "DEVELOPMENT_TEAM=ABCDEFGHIJ",
    "CODE_SIGN_STYLE=Automatic",
    "archive",
  ]);
  assert.match(result.stdout, /Tab Shelf local archive created/u);
  assert.doesNotMatch(result.stdout + result.stderr, /ABCDEFGHIJ|TOP_SECRET_TEAM/u);
  assert.equal(readFileSync(join(fixture.archivePath, "Info.plist"), "utf8").includes("com.jovaii.tabshelf"), true);
  assert.throws(() => readFileSync(join(fixture.archiveRoot, ".tab-shelf-archive.lock"), "utf8"));
});

test("public archive entrypoint accepts a relative invocation before validating Team ID", (t) => {
  const fixture = makeArchiveFixture(t);
  const result = spawnSync("/bin/bash", ["scripts/archive-app-store.sh"], {
    cwd: fixture.root,
    encoding: "utf8",
    env: {
      ...process.env,
      PATH: fixture.bin,
      APPLE_TEAM_ID: "not-a-team",
      ARCHIVE_TEAM_ID: "inherited-team-id",
      archive_team_id: "inherited-lowercase-team-id",
      TAB_SHELF_XCODE_APP: fixture.xcodeApp,
      TAB_SHELF_DEVELOPER_DIR: fixture.developerDir,
      TAB_SHELF_TEST_LOG: fixture.log,
    },
  });

  assert.equal(result.status, 1);
  assert.equal(
    result.stderr,
    "Tab Shelf App Store archive stopped: APPLE_TEAM_ID must be set to a valid enrolled team identifier.\n",
  );
  assert.deepEqual(calls(fixture), []);
});

test("public relative entrypoint clears attacker CDPATH before Team-ID validation", (t) => {
  const fixture = makeArchiveFixture(t);
  const attackerRoot = realpathSync(mkdtempSync(join(tmpdir(), "tab-shelf-cdpath-attacker-")));
  t.after(() => rmSync(attackerRoot, { recursive: true, force: true }));
  const marker = join(attackerRoot, "helper-reached");
  write(
    join(attackerRoot, "scripts/archive-app-store-workflow.sh"),
    `: > "${marker}"\nexit 73\n`,
    0o755,
  );

  const result = spawnSync("/bin/bash", ["scripts/archive-app-store.sh"], {
    cwd: fixture.root,
    encoding: "utf8",
    env: {
      ...process.env,
      PATH: fixture.bin,
      CDPATH: attackerRoot,
      APPLE_TEAM_ID: "not-a-team",
      ARCHIVE_TEAM_ID: "inherited-team-id",
      archive_team_id: "inherited-lowercase-team-id",
      TAB_SHELF_TEST_LOG: fixture.log,
    },
  });

  assert.equal(result.status, 1);
  assert.equal(
    result.stderr,
    "Tab Shelf App Store archive stopped: APPLE_TEAM_ID must be set to a valid enrolled team identifier.\n",
  );
  assert.throws(() => lstatSync(marker), { code: "ENOENT" });
  assert.deepEqual(calls(fixture), []);
});

test("public archive entrypoint refuses symlinked entrypoint and helper injection routes", (t) => {
  const expectedErrors = {
    entrypoint: "The archive entrypoint must not be a symbolic link.",
    helper: "The archive workflow helper must be a regular file and must not be a symbolic link.",
    "intermediate-directory": "The archive script directory must not be a symbolic link.",
  };
  const cases = Object.keys(expectedErrors);
  for (const attack of cases) {
    const fixture = makeArchiveFixture(t);
    const entry = join(fixture.root, "scripts/archive-app-store.sh");
    const helper = join(fixture.root, "scripts/archive-app-store-workflow.sh");
    const marker = join(fixture.root, `${attack}-injected`);
    const attacker = join(fixture.root, `${attack}-attacker`);
    mkdirSync(attacker, { recursive: true });
    write(join(attacker, "archive-app-store-workflow.sh"), `: > "${marker}"\nexit 73\n`);

    if (attack === "entrypoint") {
      const entryTarget = join(attacker, "archive-app-store.sh");
      cpSync(entry, entryTarget);
      rmSync(entry);
      write(helper, `: > "${marker}"\nexit 73\n`);
      symlinkSync(entryTarget, entry);
    } else if (attack === "helper") {
      rmSync(helper);
      symlinkSync(join(attacker, "archive-app-store-workflow.sh"), helper);
    } else {
      const scriptsTarget = join(attacker, "scripts");
      mkdirSync(scriptsTarget);
      cpSync(entry, join(scriptsTarget, "archive-app-store.sh"));
      cpSync(join(attacker, "archive-app-store-workflow.sh"), join(scriptsTarget, "archive-app-store-workflow.sh"));
      rmSync(join(fixture.root, "scripts"), { recursive: true, force: true });
      symlinkSync(scriptsTarget, join(fixture.root, "scripts"));
    }

    const result = runPublicArchive(fixture);
    assert.equal(result.status, 1, attack);
    assert.equal(
      result.stderr,
      `Tab Shelf App Store archive stopped: ${expectedErrors[attack]}\n`,
      attack,
    );
    assert.throws(() => lstatSync(marker), { code: "ENOENT" }, attack);
  }
});

test("archive behavior refuses existing and symbolic-link archive targets or a symbolic-link build parent", (t) => {
  const existing = makeArchiveFixture(t);
  mkdirSync(existing.archivePath, { recursive: true });
  const existingResult = runArchive(existing);
  assert.equal(existingResult.status, 1);
  assert.equal(calls(existing).includes("xcodebuild"), false);

  const linkedTarget = makeArchiveFixture(t);
  mkdirSync(join(linkedTarget.root, "outside"));
  mkdirSync(linkedTarget.archiveRoot, { recursive: true });
  symlinkSync(join(linkedTarget.root, "outside"), linkedTarget.archivePath);
  const linkedTargetResult = runArchive(linkedTarget);
  assert.equal(linkedTargetResult.status, 1);
  assert.equal(calls(linkedTarget).includes("xcodebuild"), false);

  const linked = makeArchiveFixture(t);
  const outside = join(linked.root, "outside");
  mkdirSync(outside);
  symlinkSync(outside, join(linked.root, "build"));
  const linkedResult = runArchive(linked);
  assert.equal(linkedResult.status, 1);
  assert.equal(calls(linked).includes("xcodebuild"), false);
});

test("archive behavior rejects an existing lock and a target created after lock acquisition", (t) => {
  const locked = makeArchiveFixture(t);
  mkdirSync(join(locked.archiveRoot, ".tab-shelf-archive.lock"), { recursive: true });
  const lockedResult = runArchive(locked);
  assert.equal(lockedResult.status, 1);
  assert.equal(calls(locked).includes("xcodebuild"), false);
  assert.equal(lstatSync(join(locked.archiveRoot, ".tab-shelf-archive.lock")).isDirectory(), true);

  const late = makeArchiveFixture(t);
  const lateResult = runArchive(late, { TAB_SHELF_LATE_TARGET: "1" });
  assert.equal(lateResult.status, 1);
  assert.equal(calls(late).includes("xcodebuild"), false);
});

test("archive behavior rejects missing and additional archived app or extension bundles", (t) => {
  for (const bundleMode of [
    "zero-app", "multi-app", "zero-extension", "missing-plugins", "multi-extension",
    "symlink-app", "symlink-extension", "hardlink-app-info",
  ]) {
    const fixture = makeArchiveFixture(t);
    const result = runArchive(fixture, { TAB_SHELF_BUNDLE_MODE: bundleMode });
    assert.equal(result.status, 1, bundleMode);
    assert.equal(calls(fixture).includes("xcodebuild"), true, bundleMode);
  }
});

test("archive behavior returns the original xcodebuild failure without leaking diagnostics", (t) => {
  const fixture = makeArchiveFixture(t);
  const result = runArchive(fixture, { TAB_SHELF_XCODE_STATUS: "47" });

  assert.equal(result.status, 47);
  assert.equal(calls(fixture).at(-1), "xcodebuild");
  assert.doesNotMatch(result.stdout + result.stderr, /TOP_SECRET_TEAM|ABCDEFGHIJ|private\/unsafe\/path/u);
});
