import assert from "node:assert/strict";
import test from "node:test";
import {
  buildShelfModel,
  canonicalPageUrl,
  groupKeyForUrl,
  isVisibleWebTab,
  planCloseExtraShelves,
  planCloseGroup,
} from "../extension/core/tab-model.mjs";

const extensionOrigin = "safari-web-extension://independent/";

test("accepts only normal HTTP and HTTPS tabs", () => {
  assert.equal(isVisibleWebTab({ id: 1, url: "https://example.com" }, { extensionOrigin }), true);
  assert.equal(isVisibleWebTab({ id: 2, url: "http://localhost:3000" }, { extensionOrigin }), true);
  assert.equal(isVisibleWebTab({ id: 3, url: "safari://startpage" }, { extensionOrigin }), false);
  assert.equal(isVisibleWebTab({ id: 4, url: `${extensionOrigin}shelf.html` }, { extensionOrigin }), false);
  assert.equal(isVisibleWebTab({ id: 5, url: "not a URL" }, { extensionOrigin }), false);
  assert.equal(isVisibleWebTab({ id: null, url: "https://example.com" }, { extensionOrigin }), false);
});

test("canonicalizes page URLs for duplicate comparison", () => {
  assert.equal(canonicalPageUrl("https://EXAMPLE.com:443/a/#part"), "https://example.com/a");
  assert.equal(canonicalPageUrl("http://example.com:80/?b=2&a=1#part"), "http://example.com/?b=2&a=1");
  assert.equal(canonicalPageUrl("https://example.com/path/"), "https://example.com/path");
  assert.equal(canonicalPageUrl("https://example.com/"), "https://example.com/");
  assert.equal(canonicalPageUrl("safari://startpage"), null);
});

test("normalizes a leading www label without changing another prefix", () => {
  assert.equal(groupKeyForUrl("https://www.example.com/path"), "example.com");
  assert.equal(groupKeyForUrl("https://www2.example.com/path"), "www2.example.com");
  assert.equal(groupKeyForUrl("https://EXAMPLE.com:8443/path"), "example.com");
});

test("groups visible tabs by normalized host", () => {
  const model = buildShelfModel([
    { id: 1, windowId: 10, title: "One", url: "https://www.example.com/a" },
    { id: 2, windowId: 10, title: "Two", url: "https://example.com/b" },
    { id: 3, windowId: 10, title: "Internal", url: "safari://startpage" },
    { id: 4, windowId: 10, title: "Shelf", url: `${extensionOrigin}shelf.html` },
  ], { currentShelfTabId: 4, extensionOrigin });

  assert.equal(model.visibleTabCount, 2);
  assert.equal(model.shelfTabCount, 1);
  assert.equal(model.duplicatePageCount, 0);
  assert.deepEqual(
    model.groups.map((group) => [group.key, group.tabs.length]),
    [["example.com", 2]],
  );
});

test("marks duplicate pages without discarding either tab", () => {
  const model = buildShelfModel([
    { id: 1, windowId: 10, title: "One", url: "https://example.com/a" },
    { id: 2, windowId: 11, title: "Two", url: "https://example.com/a#section" },
    { id: 3, windowId: 11, title: "Three", url: "https://example.com/b" },
  ], { currentShelfTabId: 99, extensionOrigin });

  assert.equal(model.duplicatePageCount, 1);
  assert.equal(model.groups[0].tabs.length, 3);
  assert.deepEqual(model.groups[0].tabs.map((tab) => tab.isDuplicate), [true, true, false]);
});

test("sorts domain groups while preserving tab query order", () => {
  const model = buildShelfModel([
    { id: 8, windowId: 2, title: "Zulu", url: "https://zulu.test/first" },
    { id: 4, windowId: 1, title: "Alpha second", url: "https://alpha.test/second" },
    { id: 3, windowId: 1, title: "Alpha first", url: "https://alpha.test/first" },
  ], { currentShelfTabId: 99, extensionOrigin });

  assert.deepEqual(model.groups.map((group) => group.key), ["alpha.test", "zulu.test"]);
  assert.deepEqual(model.groups[0].tabs.map((tab) => tab.id), [4, 3]);
});

test("uses a safe fallback title and admitted favicon URL", () => {
  const model = buildShelfModel([
    { id: 1, windowId: 1, title: "", url: "https://example.com/a", favIconUrl: "javascript:alert(1)" },
    { id: 2, windowId: 1, title: "Named", url: "https://example.com/b", favIconUrl: "data:image/png;base64,AA==" },
  ], { currentShelfTabId: 99, extensionOrigin });

  assert.equal(model.groups[0].tabs[0].title, "example.com");
  assert.equal(model.groups[0].tabs[0].favIconUrl, null);
  assert.equal(model.groups[0].tabs[1].favIconUrl, "data:image/png;base64,AA==");
});

test("plans group closure with unique valid identifiers", () => {
  assert.deepEqual(planCloseGroup({ tabs: [{ id: 5 }, { id: 3 }, { id: 5 }, { id: null }] }), [5, 3]);
  assert.throws(() => planCloseGroup(null), /group/i);
});

test("closes only other shelf pages", () => {
  assert.deepEqual(planCloseExtraShelves([
    { id: 7, url: `${extensionOrigin}shelf.html` },
    { id: 8, url: `${extensionOrigin}shelf.html?source=toolbar` },
    { id: 9, url: "https://example.com" },
    { id: 10, url: `${extensionOrigin}settings.html` },
  ], { currentShelfTabId: 7, extensionOrigin }), [8]);
});
