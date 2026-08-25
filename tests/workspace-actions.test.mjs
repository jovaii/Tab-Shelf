import assert from "node:assert/strict";
import test from "node:test";
import { createDefaultWorkspace, validateWorkspace } from "../extension/core/workspace.mjs";
import { applyWorkspaceAction } from "../extension/core/workspace-actions.mjs";

function editableWorkspace(changes = {}) {
  return validateWorkspace({
    ...structuredClone(createDefaultWorkspace()),
    ...changes,
  });
}

test("moves a card and records a permanent category assignment", () => {
  const before = createDefaultWorkspace();
  const after = applyWorkspaceAction(before, {
    type: "move-card",
    domain: "linkedin.com",
    toGroupId: "system:communication",
    beforeDomain: null,
  });

  assert.deepEqual(after.assignments, [
    { domain: "linkedin.com", groupId: "system:communication" },
  ]);
  assert.deepEqual(after.cardOrders, [
    { groupId: "system:communication", domains: ["linkedin.com"] },
  ]);
  assert.deepEqual(before, createDefaultWorkspace());
  assert.equal(Object.isFrozen(after), true);
});

test("uses the visible destination order for an exact same-category move", () => {
  const before = editableWorkspace({
    assignments: [
      { domain: "alpha.test", groupId: "system:other" },
      { domain: "beta.test", groupId: "system:other" },
      { domain: "charlie.test", groupId: "system:other" },
    ],
  });

  const after = applyWorkspaceAction(before, {
    type: "move-card",
    domain: "charlie.test",
    toGroupId: "system:other",
    beforeDomain: "beta.test",
    visibleDomains: ["alpha.test", "beta.test", "charlie.test"],
  });

  assert.deepEqual(after.cardOrders, [{
    groupId: "system:other",
    domains: ["alpha.test", "charlie.test", "beta.test"],
  }]);
});

test("moves across categories once and removes obsolete order records", () => {
  const before = editableWorkspace({
    assignments: [
      { domain: "linkedin.com", groupId: "system:communication" },
      { domain: "example.test", groupId: "system:other" },
    ],
    cardOrders: [
      { groupId: "system:communication", domains: ["linkedin.com"] },
      { groupId: "system:other", domains: ["example.test"] },
    ],
  });

  const after = applyWorkspaceAction(before, {
    type: "move-card",
    domain: "linkedin.com",
    toGroupId: "system:other",
    beforeDomain: "example.test",
    visibleDomains: ["example.test"],
  });

  assert.deepEqual(after.assignments, [
    { domain: "example.test", groupId: "system:other" },
    { domain: "linkedin.com", groupId: "system:other" },
  ]);
  assert.deepEqual(after.cardOrders, [{
    groupId: "system:other",
    domains: ["linkedin.com", "example.test"],
  }]);
  assert.deepEqual(before.cardOrders, [
    { groupId: "system:communication", domains: ["linkedin.com"] },
    { groupId: "system:other", domains: ["example.test"] },
  ]);
});

test("creates, renames, toggles, reorders, and deletes a custom category", () => {
  let workspace = applyWorkspaceAction(createDefaultWorkspace(), {
    type: "create-category",
    id: "custom:recruiting",
    name: " Recruiting ",
  });
  assert.equal(workspace.customGroups[0].name, "Recruiting");
  assert.equal(
    workspace.groupOrder.indexOf("custom:recruiting"),
    workspace.groupOrder.indexOf("system:other") - 1,
  );

  workspace = applyWorkspaceAction(workspace, {
    type: "rename-category",
    groupId: "custom:recruiting",
    name: "Hiring",
  });
  workspace = applyWorkspaceAction(workspace, {
    type: "toggle-category",
    groupId: "custom:recruiting",
  });
  workspace = applyWorkspaceAction(workspace, {
    type: "move-category",
    groupId: "custom:recruiting",
    beforeGroupId: "system:ai-research",
  });
  assert.equal(workspace.customGroups[0].name, "Hiring");
  assert.deepEqual(workspace.collapsedGroupIds, ["custom:recruiting"]);
  assert.equal(workspace.groupOrder[0], "custom:recruiting");

  workspace = applyWorkspaceAction(workspace, {
    type: "move-card",
    domain: "jobs.test",
    toGroupId: "custom:recruiting",
    beforeDomain: null,
  });
  workspace = applyWorkspaceAction(workspace, {
    type: "delete-category",
    groupId: "custom:recruiting",
  });

  assert.deepEqual(workspace.customGroups, []);
  assert.equal(workspace.assignments.some(({ domain }) => domain === "jobs.test"), false);
  assert.equal(workspace.cardOrders.some(({ groupId }) => groupId === "custom:recruiting"), false);
  assert.equal(workspace.collapsedGroupIds.includes("custom:recruiting"), false);
  assert.equal(workspace.groupOrder.includes("custom:recruiting"), false);
});

test("resets only the workspace layout", () => {
  const changed = applyWorkspaceAction(createDefaultWorkspace(), {
    type: "toggle-category",
    groupId: "system:news-media",
  });

  assert.deepEqual(
    applyWorkspaceAction(changed, { type: "reset-workspace" }),
    createDefaultWorkspace(),
  );
});

test("rejects malformed and unsupported actions without mutating input", () => {
  const before = createDefaultWorkspace();
  const unsafe = Object.create({ inherited: true });
  Object.assign(unsafe, { type: "reset-workspace" });

  assert.throws(() => applyWorkspaceAction(before, unsafe), /plain object/);
  assert.throws(
    () => applyWorkspaceAction(before, { type: "reset-workspace", surprise: true }),
    /Unknown workspace action key/,
  );
  assert.throws(() => applyWorkspaceAction(before, { type: "unknown" }), /Unsupported/);
  assert.throws(
    () => applyWorkspaceAction(before, {
      type: "move-card",
      domain: "",
      toGroupId: "system:other",
      beforeDomain: null,
    }),
    /domain/i,
  );
  assert.throws(
    () => applyWorkspaceAction(before, {
      type: "move-card",
      domain: "one.test",
      toGroupId: "system:other",
      beforeDomain: "missing.test",
      visibleDomains: ["present.test"],
    }),
    /destination/i,
  );
  assert.deepEqual(before, createDefaultWorkspace());
});
