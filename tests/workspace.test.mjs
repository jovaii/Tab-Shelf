import assert from "node:assert/strict";
import test from "node:test";
import {
  WORKSPACE_KEY,
  buildWorkspaceView,
  createDefaultWorkspace,
  validateWorkspace,
} from "../extension/core/workspace.mjs";

const card = (key, title = key) => ({
  key,
  label: key,
  tabs: [{ title }],
});

const shelfModel = (...groups) => ({
  visibleTabCount: groups.length,
  duplicatePageCount: 0,
  shelfTabCount: 1,
  groups,
});

test("creates a frozen empty workspace under the separate schema", () => {
  const workspace = createDefaultWorkspace();

  assert.equal(WORKSPACE_KEY, "tabShelf.workspace.v1");
  assert.deepEqual(workspace, {
    schema: WORKSPACE_KEY,
    revision: 1,
    groupOrder: [],
    collapsedGroupIds: [],
    customGroups: [],
    assignments: [],
    cardOrders: [],
  });
  assert.equal(Object.isFrozen(workspace), true);
  assert.equal(Object.values(workspace).filter(Array.isArray).every(Object.isFrozen), true);
});

test("rejects unknown keys and unsafe prototypes at every admitted object boundary", () => {
  const valid = structuredClone(createDefaultWorkspace());
  assert.throws(() => validateWorkspace({ ...valid, surprise: true }), /Unknown workspace key/);
  assert.throws(
    () => validateWorkspace(Object.assign(Object.create({ unsafe: true }), valid)),
    /plain object/,
  );

  valid.customGroups.push({ id: "custom:recruiting", name: "Recruiting", surprise: true });
  assert.throws(() => validateWorkspace(valid), /Unknown custom group key/);
});

test("rejects duplicate identities, domains, names, and conflicting order records", () => {
  const duplicateAssignments = structuredClone(createDefaultWorkspace());
  duplicateAssignments.assignments = [
    { domain: "example.test", groupId: "system:other" },
    { domain: "EXAMPLE.TEST", groupId: "system:travel" },
  ];
  assert.throws(() => validateWorkspace(duplicateAssignments), /duplicate assignment domain/i);

  const duplicateNames = structuredClone(createDefaultWorkspace());
  duplicateNames.customGroups = [
    { id: "custom:recruiting", name: "Recruiting" },
    { id: "custom:hiring", name: " recruiting " },
  ];
  assert.throws(() => validateWorkspace(duplicateNames), /duplicate custom group name/i);

  const conflictingOrder = structuredClone(createDefaultWorkspace());
  conflictingOrder.assignments = [
    { domain: "example.test", groupId: "system:travel" },
  ];
  conflictingOrder.cardOrders = [
    { groupId: "system:other", domains: ["example.test"] },
  ];
  assert.throws(() => validateWorkspace(conflictingOrder), /conflicting domain group/i);
});

test("normalizes detached custom names and domain records", () => {
  const input = structuredClone(createDefaultWorkspace());
  input.customGroups = [{ id: "custom:recruiting", name: "  Talent\n  Pipeline  " }];
  input.groupOrder = ["custom:recruiting"];
  input.collapsedGroupIds = ["custom:recruiting"];
  input.assignments = [{ domain: " WWW.Example.TEST ", groupId: "custom:recruiting" }];
  input.cardOrders = [{
    groupId: "custom:recruiting",
    domains: ["WWW.Example.TEST"],
  }];
  const before = structuredClone(input);

  const workspace = validateWorkspace(input);

  assert.equal(workspace.customGroups[0].name, "Talent Pipeline");
  assert.equal(workspace.assignments[0].domain, "example.test");
  assert.equal(workspace.cardOrders[0].domains[0], "example.test");
  assert.equal(Object.isFrozen(workspace.customGroups[0]), true);
  assert.deepEqual(input, before);
});

test("enforces category, retained-domain, name, and serialized storage bounds", () => {
  const tooManyGroups = structuredClone(createDefaultWorkspace());
  tooManyGroups.customGroups = Array.from({ length: 25 }, (_, index) => ({
    id: `custom:group-${index}`,
    name: `Group ${index}`,
  }));
  assert.throws(() => validateWorkspace(tooManyGroups), /24 custom groups/);

  const tooLongName = structuredClone(createDefaultWorkspace());
  tooLongName.customGroups = [{ id: "custom:long", name: "x".repeat(41) }];
  assert.throws(() => validateWorkspace(tooLongName), /40 visible characters/);

  const tooManyDomains = structuredClone(createDefaultWorkspace());
  tooManyDomains.assignments = Array.from({ length: 2_049 }, (_, index) => ({
    domain: `domain-${index}.test`,
    groupId: "system:other",
  }));
  assert.throws(() => validateWorkspace(tooManyDomains), /2,048 retained domains/);

  const oversized = structuredClone(createDefaultWorkspace());
  const suffix = `${"x".repeat(225)}.test`;
  oversized.assignments = Array.from({ length: 2_048 }, (_, index) => ({
    domain: `d${index}.${suffix}`,
    groupId: "system:other",
  }));
  assert.throws(() => validateWorkspace(oversized), /storage budget/);
});

test("merges automatic cards with a permanent manual category and stored order", () => {
  const model = shelfModel(
    card("chatgpt.com", "ChatGPT"),
    card("fresh.test", "Fresh"),
    card("example.test", "Example"),
  );
  const workspace = structuredClone(createDefaultWorkspace());
  workspace.customGroups.push({ id: "custom:recruiting", name: "Recruiting" });
  workspace.groupOrder.push("custom:recruiting", "system:ai-research");
  workspace.collapsedGroupIds.push("custom:recruiting");
  workspace.assignments.push({ domain: "example.test", groupId: "custom:recruiting" });
  workspace.cardOrders.push({
    groupId: "custom:recruiting",
    domains: ["dormant.test", "example.test"],
  }, {
    groupId: "system:other",
    domains: ["other-dormant.test", "fresh.test"],
  });

  const view = buildWorkspaceView(model, workspace);

  assert.deepEqual(view.categories.map(({ id }) => id), [
    "custom:recruiting",
    "system:ai-research",
    "system:other",
  ]);
  assert.deepEqual(
    view.categories.flatMap(({ cards }) => cards.map(({ key }) => key)),
    ["example.test", "chatgpt.com", "fresh.test"],
  );
  const custom = view.categories[0];
  assert.equal(custom.name, "Recruiting");
  assert.equal(custom.kind, "custom");
  assert.equal(custom.collapsed, true);
  assert.equal(custom.cards[0], model.groups[2]);
  assert.equal(Object.isFrozen(view.categories), true);
  assert.equal(Object.isFrozen(custom), true);
  assert.equal(Object.isFrozen(custom.cards), true);
});

test("keeps empty custom categories and hides empty system categories", () => {
  const workspace = structuredClone(createDefaultWorkspace());
  workspace.customGroups.push({ id: "custom:empty", name: "Empty" });

  const view = buildWorkspaceView(shelfModel(card("chatgpt.com", "ChatGPT")), workspace);

  assert.deepEqual(view.categories.map(({ id }) => id), [
    "system:ai-research",
    "custom:empty",
  ]);
  assert.deepEqual(view.categories[1].cards, []);
});

test("rejects malformed shelf models without exposing their contents", () => {
  assert.throws(() => buildWorkspaceView(null, createDefaultWorkspace()), /shelf model/i);
  assert.throws(
    () => buildWorkspaceView({ groups: [{ key: "", tabs: [] }] }, createDefaultWorkspace()),
    /domain group/i,
  );
});
