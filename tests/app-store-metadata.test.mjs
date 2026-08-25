import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function source(path) {
  return readFileSync(path, "utf8");
}

function assertInOrder(content, entries) {
  let previous = -1;
  for (const entry of entries) {
    const position = content.indexOf(entry);
    assert.ok(position > previous, `${entry} must appear in the approved order`);
    previous = position;
  }
}

test("publishes the exact one-time paid App Store listing", () => {
  const listing = source("docs/app-store/listing.md");

  for (const field of [
    "Name: Tab Shelf",
    "Subtitle: A calm shelf for Safari tabs",
    "Category: Productivity",
    "Price: USD 9.99 one-time purchase",
    "Keywords: Safari,tabs,organizer,duplicates,new tab,privacy,productivity",
    "Support URL: https://github.com/jovaii/Tab-Shelf/blob/main/SUPPORT.md",
    "Privacy URL: https://github.com/jovaii/Tab-Shelf/blob/main/PRIVACY.md",
    "Product/source URL: https://github.com/jovaii/Tab-Shelf",
  ]) {
    assert.match(listing, new RegExp(`^${field.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")}$`, "mu"));
  }

  for (const feature of [
    /domain cards/u,
    /automatic local categories/u,
    /dedicated drag handles/u,
    /keyboard move menus/u,
    /custom categories/u,
    /never reorder Safari's native tabs, windows, or Tab Groups/u,
    /duplicate cleanup/u,
    /tab actions/u,
    /five themes/u,
    /custom backgrounds/u,
    /Appearance preferences and workspace organization stay local/u,
    /collect[^.]*nothing/iu,
    /no account/iu,
  ]) {
    assert.match(listing, feature);
  }
});

test("records conditional privacy answers and the bounded Safari permission", () => {
  const privacy = source("docs/app-store/privacy-answers.md");

  assert.match(privacy, /^Data collected: None$/m);
  assert.match(privacy, /conditional on the final candidate passing the no-network and dependency audit/iu);
  assert.match(
    privacy,
    /Safari[^\n]*browsing-history permission[^\n]*only to read and manage tabs already open in Safari/iu,
  );
  assert.match(privacy, /does not build or transmit a browsing-history database/iu);
});

test("gives App Review an ordered disposable-tab walkthrough", () => {
  const review = source("docs/app-store/review-notes.md");

  assertInOrder(review, [
    "Safari Settings → Extensions",
    "disposable tabs",
    "new tab",
    "grouping",
    "dedicated handle",
    "move menus",
    "custom category",
    "Theme Studio",
    "Reset tab layout",
    "close actions",
  ]);
  assert.match(review, /enable Tab Shelf/iu);
});

test("keeps account-owned prerequisites value-free and preserves manual submission", () => {
  const checklist = source("docs/app-store/submission-checklist.md");

  for (const prerequisite of [
    /active Apple Developer Program membership/iu,
    /Paid Apps Agreement[^\n]*accepted/iu,
    /banking[^\n]*complete/iu,
    /tax[^\n]*complete/iu,
    /App record[^\n]*verified/iu,
    /identifiers[^\n]*verified/iu,
    /USD 9\.99[^\n]*selected/iu,
    /archive[^\n]*validated/iu,
    /screenshots[^\n]*uploaded/iu,
    /privacy answers[^\n]*final candidate/iu,
    /review notes[^\n]*entered/iu,
    /manual approval[^\n]*Submit for Review/iu,
  ]) {
    assert.match(checklist, prerequisite);
  }

  assert.match(checklist, /Do not record[^\n]*(?:membership|agreement|bank|tax|identifier|credential)[^\n]*values/iu);
});

test("separates completed local preparation from Apple-account delivery gates", () => {
  const checklist = source("docs/app-store/submission-checklist.md");

  for (const completed of [
    /\[x\][^\n]*314\/314 automated tests/iu,
    /\[x\][^\n]*exactly one Tab Shelf Safari extension registration/iu,
    /\[x\][^\n]*real Safari/iu,
    /\[x\][^\n]*screenshot package is prepared/iu,
    /\[x\][^\n]*privacy answers match/iu,
    /\[x\][^\n]*review notes are prepared/iu,
  ]) {
    assert.match(checklist, completed);
  }

  for (const appleGate of [
    /\[ \][^\n]*active Apple Developer Program membership/iu,
    /\[ \][^\n]*Paid Apps Agreement/iu,
    /\[ \][^\n]*release archive is validated/iu,
    /\[ \][^\n]*final screenshots are uploaded/iu,
    /\[ \][^\n]*Submit for Review/iu,
  ]) {
    assert.match(checklist, appleGate);
  }
});

test("prepares an exact Mac App Store primary screenshot", () => {
  const png = readFileSync("docs/assets/tab-shelf-hero.png");

  assert.equal(png.subarray(1, 4).toString("ascii"), "PNG");
  assert.equal(png.readUInt32BE(16), 1440);
  assert.equal(png.readUInt32BE(20), 900);
});

test("keeps every App Store document English-only and release-safe", () => {
  const paths = [
    "docs/app-store/listing.md",
    "docs/app-store/privacy-answers.md",
    "docs/app-store/review-notes.md",
    "docs/app-store/submission-checklist.md",
  ];
  const combined = paths.map(source).join("\n");

  assert.doesNotMatch(combined, /[\p{Script=Han}]/u);
  assert.doesNotMatch(combined, /apps\.apple\.com/iu);
  assert.doesNotMatch(combined, /subscription|advertising|account required/iu);
  assert.doesNotMatch(combined, /-----BEGIN [A-Z ]*PRIVATE KEY-----|AKIA[0-9A-Z]{16}/u);
  assert.doesNotMatch(combined, /(?:team|issuer|key|credential)\s*(?:id|value)?\s*[:=]\s*[A-Z0-9_-]{8,}/iu);
});
