import {
  SYSTEM_CATEGORIES,
  SYSTEM_CATEGORY_IDS,
  classifyDomainGroup,
} from "./classifier.mjs";

export const WORKSPACE_KEY = "tabShelf.workspace.v1";

const WORKSPACE_REVISION = 1;
const MAX_CUSTOM_GROUPS = 24;
const MAX_RETAINED_DOMAINS = 2_048;
const MAX_WORKSPACE_BYTES = 512 * 1024;
const MAX_CUSTOM_NAME_CHARACTERS = 40;
const MAX_DOMAIN_CHARACTERS = 253;
const MAX_CUSTOM_ID_CHARACTERS = 48;
const CUSTOM_ID = /^custom:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/u;
const DOMAIN = /^[a-z0-9._:[\]-]+$/u;

const WORKSPACE_KEYS = Object.freeze([
  "schema",
  "revision",
  "groupOrder",
  "collapsedGroupIds",
  "customGroups",
  "assignments",
  "cardOrders",
]);
const CUSTOM_GROUP_KEYS = Object.freeze(["id", "name"]);
const ASSIGNMENT_KEYS = Object.freeze(["domain", "groupId"]);
const CARD_ORDER_KEYS = Object.freeze(["groupId", "domains"]);
const SYSTEM_ID_SET = new Set(SYSTEM_CATEGORY_IDS);

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function assertPlainObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${label} must be a plain object`);
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new TypeError(`${label} must be a plain object`);
  }
}

function assertKnownKeys(value, allowed, label) {
  const admitted = new Set(allowed);
  for (const key of Object.keys(value)) {
    if (!admitted.has(key)) throw new TypeError(`Unknown ${label} key`);
  }
}

function boundedArray(value, maximum, label) {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) {
    throw new TypeError(`${label} must be an array`);
  }
  if (value.length > maximum) throw new TypeError(`${label} exceeds its supported limit`);
  return value;
}

function normalizeVisibleText(value, label) {
  if (typeof value !== "string") throw new TypeError(`${label} must be text`);
  const normalized = value.replace(/\s+/gu, " ").trim();
  const length = Array.from(normalized).length;
  if (length < 1 || length > MAX_CUSTOM_NAME_CHARACTERS) {
    throw new TypeError(`${label} must contain 1 to 40 visible characters`);
  }
  return normalized;
}

function normalizeCustomId(value) {
  if (typeof value !== "string") throw new TypeError("Custom group id must be text");
  const normalized = value.trim().toLocaleLowerCase("en-US");
  const suffixLength = normalized.startsWith("custom:")
    ? normalized.length - "custom:".length
    : Number.POSITIVE_INFINITY;
  if (!CUSTOM_ID.test(normalized) || suffixLength > MAX_CUSTOM_ID_CHARACTERS) {
    throw new TypeError("Custom group id is not supported");
  }
  return normalized;
}

function normalizeDomain(value) {
  if (typeof value !== "string") throw new TypeError("Domain must be text");
  const normalized = value
    .trim()
    .toLocaleLowerCase("en-US")
    .replace(/^www\./u, "")
    .replace(/\.$/u, "");
  if (
    normalized.length < 1
    || normalized.length > MAX_DOMAIN_CHARACTERS
    || !DOMAIN.test(normalized)
    || /\.\.|:::/u.test(normalized)
  ) {
    throw new TypeError("Domain is not a supported host label");
  }
  return normalized;
}

function normalizeCustomGroups(value) {
  const input = boundedArray(value, MAX_CUSTOM_GROUPS, "24 custom groups");
  const ids = new Set();
  const names = new Set();
  const groups = input.map((entry) => {
    assertPlainObject(entry, "Custom group");
    assertKnownKeys(entry, CUSTOM_GROUP_KEYS, "custom group");
    const id = normalizeCustomId(entry.id);
    const name = normalizeVisibleText(entry.name, "Custom group name");
    const foldedName = name.toLocaleLowerCase("en-US");
    if (ids.has(id)) throw new TypeError("Duplicate custom group id");
    if (names.has(foldedName)) throw new TypeError("Duplicate custom group name");
    ids.add(id);
    names.add(foldedName);
    return { id, name };
  });
  return { groups, ids };
}

function normalizeKnownGroupId(value, admittedIds, label) {
  if (typeof value !== "string") throw new TypeError(`${label} must be text`);
  const normalized = value.trim().toLocaleLowerCase("en-US");
  if (!admittedIds.has(normalized)) throw new TypeError(`${label} is not supported`);
  return normalized;
}

function normalizeUniqueGroupIds(value, admittedIds, label) {
  const input = boundedArray(value, admittedIds.size, label);
  const seen = new Set();
  return input.map((entry) => {
    const groupId = normalizeKnownGroupId(entry, admittedIds, label);
    if (seen.has(groupId)) throw new TypeError(`Duplicate ${label}`);
    seen.add(groupId);
    return groupId;
  });
}

function normalizeAssignments(value, admittedIds) {
  const input = boundedArray(value, MAX_RETAINED_DOMAINS, "2,048 retained domains");
  const domains = new Set();
  const assignments = input.map((entry) => {
    assertPlainObject(entry, "Workspace assignment");
    assertKnownKeys(entry, ASSIGNMENT_KEYS, "assignment");
    const domain = normalizeDomain(entry.domain);
    const groupId = normalizeKnownGroupId(entry.groupId, admittedIds, "Assignment group id");
    if (domains.has(domain)) throw new TypeError("Duplicate assignment domain");
    domains.add(domain);
    return { domain, groupId };
  });
  return { assignments, domains };
}

function normalizeCardOrders(value, admittedIds, assignments) {
  const input = boundedArray(value, admittedIds.size, "Workspace card orders");
  const groupIds = new Set();
  const orderedDomains = new Set();
  const assignmentMap = new Map(assignments.map(({ domain, groupId }) => [domain, groupId]));
  const cardOrders = input.map((entry) => {
    assertPlainObject(entry, "Workspace card order");
    assertKnownKeys(entry, CARD_ORDER_KEYS, "card order");
    const groupId = normalizeKnownGroupId(entry.groupId, admittedIds, "Card order group id");
    if (groupIds.has(groupId)) throw new TypeError("Duplicate card order group id");
    groupIds.add(groupId);
    const domains = boundedArray(
      entry.domains,
      MAX_RETAINED_DOMAINS,
      "2,048 retained domains",
    ).map((value) => {
      const domain = normalizeDomain(value);
      if (orderedDomains.has(domain)) throw new TypeError("Duplicate ordered domain");
      const assignedGroupId = assignmentMap.get(domain);
      if (assignedGroupId && assignedGroupId !== groupId) {
        throw new TypeError("Conflicting domain group");
      }
      orderedDomains.add(domain);
      return domain;
    });
    return { groupId, domains };
  });
  return { cardOrders, orderedDomains };
}

function requireRevision(value) {
  if (value !== WORKSPACE_REVISION) {
    throw new TypeError("Unsupported workspace revision");
  }
  return value;
}

function assertStorageBudget(value) {
  const bytes = new TextEncoder().encode(JSON.stringify(value)).byteLength;
  if (bytes >= MAX_WORKSPACE_BYTES) {
    throw new TypeError("Workspace exceeds the local storage budget");
  }
}

export function validateWorkspace(value) {
  assertPlainObject(value, "Workspace");
  assertKnownKeys(value, WORKSPACE_KEYS, "workspace");
  if (value.schema !== WORKSPACE_KEY) throw new TypeError("Unsupported workspace schema");
  const { groups: customGroups, ids: customIds } = normalizeCustomGroups(value.customGroups);
  const admittedIds = new Set([...SYSTEM_ID_SET, ...customIds]);
  const { assignments, domains: assignmentDomains } = normalizeAssignments(
    value.assignments,
    admittedIds,
  );
  const { cardOrders, orderedDomains } = normalizeCardOrders(
    value.cardOrders,
    admittedIds,
    assignments,
  );
  if (new Set([...assignmentDomains, ...orderedDomains]).size > MAX_RETAINED_DOMAINS) {
    throw new TypeError("Workspace supports at most 2,048 retained domains");
  }

  const normalized = {
    schema: WORKSPACE_KEY,
    revision: requireRevision(value.revision),
    groupOrder: normalizeUniqueGroupIds(value.groupOrder, admittedIds, "group order id"),
    collapsedGroupIds: normalizeUniqueGroupIds(
      value.collapsedGroupIds,
      admittedIds,
      "collapsed group id",
    ),
    customGroups,
    assignments,
    cardOrders,
  };
  assertStorageBudget(normalized);
  return deepFreeze(normalized);
}

export function createDefaultWorkspace() {
  return validateWorkspace({
    schema: WORKSPACE_KEY,
    revision: WORKSPACE_REVISION,
    groupOrder: [],
    collapsedGroupIds: [],
    customGroups: [],
    assignments: [],
    cardOrders: [],
  });
}

function requireShelfModel(model) {
  if (!model || typeof model !== "object" || !Array.isArray(model.groups)) {
    throw new TypeError("Shelf model must contain domain groups");
  }
  const seen = new Set();
  for (const group of model.groups) {
    if (!group || typeof group !== "object" || !Array.isArray(group.tabs)) {
      throw new TypeError("Shelf model contains an invalid domain group");
    }
    let domain;
    try {
      domain = normalizeDomain(group.key);
    } catch {
      throw new TypeError("Shelf model contains an invalid domain group");
    }
    if (seen.has(domain)) throw new TypeError("Shelf model contains a duplicate domain group");
    seen.add(domain);
  }
}

function categoryDefinitions(workspace) {
  const systemWithoutOther = SYSTEM_CATEGORIES
    .filter(({ id }) => id !== "system:other")
    .map(({ id, name }) => ({ id, name, kind: "system" }));
  const custom = workspace.customGroups.map(({ id, name }) => ({ id, name, kind: "custom" }));
  const other = SYSTEM_CATEGORIES
    .filter(({ id }) => id === "system:other")
    .map(({ id, name }) => ({ id, name, kind: "system" }));
  return [...systemWithoutOther, ...custom, ...other];
}

function orderedDefinitions(workspace) {
  const definitions = categoryDefinitions(workspace);
  const byId = new Map(definitions.map((definition) => [definition.id, definition]));
  const ordered = workspace.groupOrder.map((id) => byId.get(id));
  const explicit = new Set(workspace.groupOrder);
  ordered.push(...definitions.filter(({ id }) => !explicit.has(id)));
  return ordered;
}

function orderCards(cards, domainOrder) {
  const position = new Map(domainOrder.map((domain, index) => [domain, index]));
  return cards
    .map((card, index) => ({ card, index, position: position.get(normalizeDomain(card.key)) }))
    .sort((left, right) => {
      const leftRank = left.position ?? Number.POSITIVE_INFINITY;
      const rightRank = right.position ?? Number.POSITIVE_INFINITY;
      return leftRank - rightRank || left.index - right.index;
    })
    .map(({ card }) => card);
}

export function buildWorkspaceView(model, value) {
  requireShelfModel(model);
  const workspace = validateWorkspace(value);
  const definitions = orderedDefinitions(workspace);
  const cardsByGroup = new Map(definitions.map(({ id }) => [id, []]));
  const assignments = new Map(
    workspace.assignments.map(({ domain, groupId }) => [domain, groupId]),
  );
  const storedOrders = new Map(
    workspace.cardOrders.map(({ groupId, domains }) => [groupId, domains]),
  );

  for (const card of model.groups) {
    const domain = normalizeDomain(card.key);
    const groupId = assignments.get(domain) ?? classifyDomainGroup(card);
    cardsByGroup.get(groupId).push(card);
  }

  const collapsed = new Set(workspace.collapsedGroupIds);
  const categories = definitions
    .map(({ id, name, kind }) => {
      const cards = orderCards(cardsByGroup.get(id), storedOrders.get(id) ?? []);
      return Object.freeze({
        id,
        name,
        kind,
        collapsed: collapsed.has(id),
        cards: Object.freeze(cards),
      });
    })
    .filter(({ kind, cards }) => kind === "custom" || cards.length > 0);

  return Object.freeze({
    ...model,
    categories: Object.freeze(categories),
  });
}
