import assert from "node:assert/strict";
import test from "node:test";
import {
  SYSTEM_CATEGORIES,
  SYSTEM_CATEGORY_IDS,
  classifyDomainGroup,
} from "../extension/core/classifier.mjs";

const group = (key, ...titles) => ({
  key,
  tabs: titles.map((title) => ({ title })),
});

test("publishes the fixed ordered system taxonomy", () => {
  const expected = [
    ["system:ai-research", "AI & Research"],
    ["system:work-productivity", "Work & Productivity"],
    ["system:communication", "Communication"],
    ["system:learning", "Learning"],
    ["system:shopping", "Shopping"],
    ["system:news-media", "News & Media"],
    ["system:finance", "Finance"],
    ["system:travel", "Travel"],
    ["system:utilities", "Utilities"],
    ["system:other", "Other"],
  ];

  assert.deepEqual(SYSTEM_CATEGORIES.map(({ id, name }) => [id, name]), expected);
  assert.deepEqual(SYSTEM_CATEGORY_IDS, expected.map(([id]) => id));
  assert.equal(Object.isFrozen(SYSTEM_CATEGORIES), true);
  assert.equal(SYSTEM_CATEGORIES.every(Object.isFrozen), true);
  assert.equal(Object.isFrozen(SYSTEM_CATEGORY_IDS), true);
});

test("classifies exact and suffix domains before title keywords", () => {
  assert.equal(classifyDomainGroup(group("chatgpt.com", "Unrelated")), "system:ai-research");
  assert.equal(classifyDomainGroup(group("mail.google.com", "Inbox")), "system:communication");
  assert.equal(classifyDomainGroup(group("docs.google.com", "Quarterly plan")), "system:work-productivity");
  assert.equal(classifyDomainGroup(group("sub.github.com", "Book a flight")), "system:work-productivity");
});

test("uses bounded title tokens with deterministic ties and an Other fallback", () => {
  assert.equal(classifyDomainGroup(group("example.test", "Flight booking")), "system:travel");
  assert.equal(classifyDomainGroup(group("example.test", "Research news")), "system:ai-research");
  assert.equal(classifyDomainGroup(group("example.test", "Private account 123")), "system:other");
});

test("rejects malformed groups instead of inspecting unrelated data", () => {
  assert.throws(() => classifyDomainGroup(null), /group/i);
  assert.throws(() => classifyDomainGroup({ key: "example.test", tabs: null }), /tabs/i);
  assert.throws(() => classifyDomainGroup({ key: "", tabs: [] }), /key/i);
});
