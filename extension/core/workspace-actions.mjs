import { SYSTEM_CATEGORY_IDS } from "./classifier.mjs";
import {
  createDefaultWorkspace,
  normalizeWorkspaceDomain,
  validateWorkspace,
} from "./workspace.mjs";

const ACTION_KEYS = Object.freeze({
  "move-card": Object.freeze([
    "type",
    "domain",
    "toGroupId",
    "beforeDomain",
    "visibleDomains",
  ]),
  "move-category": Object.freeze(["type", "groupId", "beforeGroupId"]),
  "create-category": Object.freeze(["type", "id", "name"]),
  "rename-category": Object.freeze(["type", "groupId", "name"]),
  "toggle-category": Object.freeze(["type", "groupId"]),
  "delete-category": Object.freeze(["type", "groupId"]),
  "reset-workspace": Object.freeze(["type"]),
});

function assertPlainAction(action) {
  if (!action || typeof action !== "object" || Array.isArray(action)) {
    throw new TypeError("Workspace action must be a plain object");
  }
  const prototype = Object.getPrototypeOf(action);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new TypeError("Workspace action must be a plain object");
  }
  if (typeof action.type !== "string" || !Object.hasOwn(ACTION_KEYS, action.type)) {
    throw new TypeError("Unsupported workspace action");
  }
  const admitted = new Set(ACTION_KEYS[action.type]);
  for (const key of Object.keys(action)) {
    if (!admitted.has(key)) throw new TypeError("Unknown workspace action key");
  }
}

function normalizedGroupId(value, workspace, { customOnly = false } = {}) {
  if (typeof value !== "string") throw new TypeError("Workspace group id must be text");
  const groupId = value.trim().toLocaleLowerCase("en-US");
  const customIds = workspace.customGroups.map(({ id }) => id);
  const admitted = customOnly ? customIds : [...SYSTEM_CATEGORY_IDS, ...customIds];
  if (!admitted.includes(groupId)) throw new TypeError("Workspace group id is not supported");
  return groupId;
}

function normalizedOptionalDomain(value, label) {
  if (value === null) return null;
  if (value === undefined) throw new TypeError(`${label} is required`);
  try {
    return normalizeWorkspaceDomain(value);
  } catch {
    throw new TypeError(`${label} is not a supported domain`);
  }
}

function normalizedVisibleDomains(value) {
  if (value === undefined) return null;
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) {
    throw new TypeError("Visible destination domains must be an array");
  }
  if (value.length > 2_048) {
    throw new TypeError("Visible destination domains exceed the supported limit");
  }
  const seen = new Set();
  return value.map((entry) => {
    let domain;
    try {
      domain = normalizeWorkspaceDomain(entry);
    } catch {
      throw new TypeError("Visible destination domain is not supported");
    }
    if (seen.has(domain)) throw new TypeError("Visible destination domains contain a duplicate");
    seen.add(domain);
    return domain;
  });
}

function effectiveGroupOrder(workspace) {
  const customIds = workspace.customGroups.map(({ id }) => id);
  const base = [
    ...SYSTEM_CATEGORY_IDS.filter((id) => id !== "system:other"),
    ...customIds,
    "system:other",
  ];
  const explicit = new Set(workspace.groupOrder);
  return [...workspace.groupOrder, ...base.filter((id) => !explicit.has(id))];
}

function removeDomainsFromOrders(workspace, domains) {
  workspace.cardOrders = workspace.cardOrders
    .map(({ groupId, domains: orderedDomains }) => ({
      groupId,
      domains: orderedDomains.filter((domain) => !domains.has(domain)),
    }))
    .filter(({ domains: orderedDomains }) => orderedDomains.length > 0);
}

function setCardOrder(workspace, groupId, domains) {
  workspace.cardOrders = workspace.cardOrders.filter((entry) => entry.groupId !== groupId);
  if (domains.length > 0) workspace.cardOrders.push({ groupId, domains });
}

function moveCard(workspace, action) {
  const domain = normalizedOptionalDomain(action.domain, "Card domain");
  const toGroupId = normalizedGroupId(action.toGroupId, workspace);
  const beforeDomain = normalizedOptionalDomain(action.beforeDomain, "Destination domain");
  const visibleDomains = normalizedVisibleDomains(action.visibleDomains);
  if (beforeDomain === domain) throw new TypeError("Destination domain must differ from the card");
  if (visibleDomains && beforeDomain && !visibleDomains.includes(beforeDomain)) {
    throw new TypeError("Destination domain is no longer visible");
  }

  const assignments = new Map(
    workspace.assignments.map((entry) => [entry.domain, entry.groupId]),
  );
  for (const visibleDomain of visibleDomains ?? []) {
    const assignedGroupId = assignments.get(visibleDomain);
    if (visibleDomain !== domain && assignedGroupId && assignedGroupId !== toGroupId) {
      throw new TypeError("Visible destination category changed");
    }
  }

  const targetOrder = workspace.cardOrders.find(({ groupId }) => groupId === toGroupId)?.domains ?? [];
  const targetDormant = visibleDomains
    ? targetOrder.filter((entry) => !visibleDomains.includes(entry) && entry !== domain)
    : [];
  let ordered = visibleDomains
    ? visibleDomains.filter((entry) => entry !== domain)
    : targetOrder.filter((entry) => entry !== domain);

  if (beforeDomain) {
    const beforeIndex = ordered.indexOf(beforeDomain);
    if (beforeIndex < 0) throw new TypeError("Destination domain is no longer available");
    ordered.splice(beforeIndex, 0, domain);
  } else {
    ordered.push(domain);
  }
  ordered.push(...targetDormant.filter((entry) => !ordered.includes(entry)));

  const movedDomains = new Set([domain, ...(visibleDomains ?? [])]);
  removeDomainsFromOrders(workspace, movedDomains);
  setCardOrder(workspace, toGroupId, ordered);
  workspace.assignments = workspace.assignments.filter((entry) => entry.domain !== domain);
  workspace.assignments.push({ domain, groupId: toGroupId });
}

function moveCategory(workspace, action) {
  const groupId = normalizedGroupId(action.groupId, workspace);
  const beforeGroupId = action.beforeGroupId === null
    ? null
    : normalizedGroupId(action.beforeGroupId, workspace);
  if (groupId === beforeGroupId) throw new TypeError("Category destination must differ");
  const order = effectiveGroupOrder(workspace).filter((id) => id !== groupId);
  if (beforeGroupId === null) order.push(groupId);
  else order.splice(order.indexOf(beforeGroupId), 0, groupId);
  workspace.groupOrder = order;
}

function createCategory(workspace, action) {
  workspace.customGroups.push({ id: action.id, name: action.name });
  const normalized = structuredClone(validateWorkspace(workspace));
  const groupId = normalized.customGroups.at(-1).id;
  const order = effectiveGroupOrder(normalized).filter((id) => id !== groupId);
  order.splice(order.indexOf("system:other"), 0, groupId);
  normalized.groupOrder = order;
  return normalized;
}

function renameCategory(workspace, action) {
  const groupId = normalizedGroupId(action.groupId, workspace, { customOnly: true });
  const group = workspace.customGroups.find(({ id }) => id === groupId);
  group.name = action.name;
}

function toggleCategory(workspace, action) {
  const groupId = normalizedGroupId(action.groupId, workspace);
  if (workspace.collapsedGroupIds.includes(groupId)) {
    workspace.collapsedGroupIds = workspace.collapsedGroupIds.filter((id) => id !== groupId);
  } else {
    workspace.collapsedGroupIds.push(groupId);
  }
}

function deleteCategory(workspace, action) {
  const groupId = normalizedGroupId(action.groupId, workspace, { customOnly: true });
  workspace.customGroups = workspace.customGroups.filter(({ id }) => id !== groupId);
  workspace.groupOrder = workspace.groupOrder.filter((id) => id !== groupId);
  workspace.collapsedGroupIds = workspace.collapsedGroupIds.filter((id) => id !== groupId);
  workspace.assignments = workspace.assignments.filter((entry) => entry.groupId !== groupId);
  workspace.cardOrders = workspace.cardOrders.filter((entry) => entry.groupId !== groupId);
}

export function applyWorkspaceAction(value, action) {
  let workspace = structuredClone(validateWorkspace(value));
  assertPlainAction(action);

  switch (action.type) {
    case "move-card":
      moveCard(workspace, action);
      break;
    case "move-category":
      moveCategory(workspace, action);
      break;
    case "create-category":
      workspace = createCategory(workspace, action);
      break;
    case "rename-category":
      renameCategory(workspace, action);
      break;
    case "toggle-category":
      toggleCategory(workspace, action);
      break;
    case "delete-category":
      deleteCategory(workspace, action);
      break;
    case "reset-workspace":
      return createDefaultWorkspace();
    default:
      throw new TypeError("Unsupported workspace action");
  }

  return validateWorkspace(workspace);
}
