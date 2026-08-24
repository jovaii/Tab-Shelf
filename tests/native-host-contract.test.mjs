import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = (path) => readFileSync(path, "utf8");

test("native host is local, branded, and accessible", () => {
  const html = source("native/host/Base.lproj/Main.html");
  assert.match(html, /<h1>Tab Shelf<\/h1>/u);
  assert.match(html, /Your Safari tabs stay on this Mac\./u);
  assert.match(html, /aria-live="polite"/u);
  assert.match(html, /Open Safari Settings/u);
  assert.doesNotMatch(html, /https?:\/\//u);
  assert.match(html, /default-src 'self'/u);
});

test("native bridge exposes only approved actions", () => {
  const script = source("native/host/Script.js");
  for (const action of ["open-preferences", "open-privacy", "open-support", "open-source"]) {
    assert.match(script, new RegExp(action));
  }
  assert.match(script, /showExtensionState/u);
  assert.doesNotMatch(script, /fetch\(|XMLHttpRequest|WebSocket/iu);
});

test("Swift controller handles extension state without forced casts", () => {
  const swift = source("native/host/ViewController.swift");
  assert.match(swift, /com\.jovaii\.tabshelf\.extension/u);
  assert.match(swift, /SFSafariExtensionManager\.getStateOfSafariExtension/u);
  assert.match(swift, /SFSafariApplication\.showPreferencesForExtension/u);
  assert.match(swift, /guard let action = message\.body as\? String/u);
  assert.doesNotMatch(swift, /as! String/u);
});
