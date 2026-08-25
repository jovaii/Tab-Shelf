const OTHER_CATEGORY_ID = "system:other";
const MAX_DOMAIN_LENGTH = 253;
const MAX_TABS = 128;
const MAX_TITLE_LENGTH = 512;
const MAX_TOKENS = 256;

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

export const SYSTEM_CATEGORIES = deepFreeze([
  { id: "system:ai-research", name: "AI & Research" },
  { id: "system:work-productivity", name: "Work & Productivity" },
  { id: "system:communication", name: "Communication" },
  { id: "system:learning", name: "Learning" },
  { id: "system:shopping", name: "Shopping" },
  { id: "system:news-media", name: "News & Media" },
  { id: "system:finance", name: "Finance" },
  { id: "system:travel", name: "Travel" },
  { id: "system:utilities", name: "Utilities" },
  { id: OTHER_CATEGORY_ID, name: "Other" },
]);

export const SYSTEM_CATEGORY_IDS = Object.freeze(
  SYSTEM_CATEGORIES.map(({ id }) => id),
);

const DOMAIN_RULES = deepFreeze([
  ["system:ai-research", [
    "anthropic.com",
    "arxiv.org",
    "chatgpt.com",
    "claude.ai",
    "consensus.app",
    "gemini.google.com",
    "huggingface.co",
    "notebooklm.google.com",
    "openai.com",
    "perplexity.ai",
    "researchgate.net",
    "scispace.com",
  ]],
  ["system:work-productivity", [
    "airtable.com",
    "asana.com",
    "canva.com",
    "clickup.com",
    "docs.google.com",
    "drive.google.com",
    "figma.com",
    "github.com",
    "gitlab.com",
    "miro.com",
    "monday.com",
    "notion.so",
    "trello.com",
  ]],
  ["system:communication", [
    "discord.com",
    "linkedin.com",
    "mail.google.com",
    "messenger.com",
    "outlook.live.com",
    "outlook.office.com",
    "slack.com",
    "teams.microsoft.com",
    "telegram.org",
    "web.telegram.org",
    "web.whatsapp.com",
    "whatsapp.com",
  ]],
  ["system:learning", [
    "coursera.org",
    "edx.org",
    "khanacademy.org",
    "masterclass.com",
    "skillshare.com",
    "udacity.com",
    "udemy.com",
  ]],
  ["system:shopping", [
    "aliexpress.com",
    "amazon.com",
    "amazon.de",
    "amazon.co.uk",
    "ebay.com",
    "etsy.com",
    "ikea.com",
    "temu.com",
    "walmart.com",
  ]],
  ["system:news-media", [
    "bbc.com",
    "cnn.com",
    "news.google.com",
    "nytimes.com",
    "reuters.com",
    "spotify.com",
    "theguardian.com",
    "youtube.com",
  ]],
  ["system:finance", [
    "finance.yahoo.com",
    "interactivebrokers.com",
    "paypal.com",
    "revolut.com",
    "stripe.com",
    "tradingview.com",
    "wise.com",
  ]],
  ["system:travel", [
    "airbnb.com",
    "booking.com",
    "expedia.com",
    "flights.google.com",
    "hotels.com",
    "kayak.com",
    "skyscanner.com",
    "tripadvisor.com",
  ]],
  ["system:utilities", [
    "1password.com",
    "deepl.com",
    "maps.google.com",
    "speedtest.net",
    "translate.google.com",
  ]],
]);

const TITLE_TOKEN_RULES = deepFreeze([
  ["system:ai-research", ["ai", "artificial", "chatbot", "model", "prompt", "research"]],
  ["system:work-productivity", ["board", "design", "document", "project", "spreadsheet", "task", "workspace"]],
  ["system:communication", ["chat", "inbox", "mail", "meeting", "message", "notification"]],
  ["system:learning", ["course", "lesson", "lecture", "learn", "quiz", "tutorial"]],
  ["system:shopping", ["cart", "checkout", "deal", "order", "product", "shop", "store"]],
  ["system:news-media", ["article", "breaking", "media", "news", "podcast", "video"]],
  ["system:finance", ["bank", "budget", "finance", "invoice", "payment", "portfolio", "stock"]],
  ["system:travel", ["airline", "booking", "flight", "hotel", "train", "travel", "trip"]],
  ["system:utilities", ["calculator", "convert", "map", "speedtest", "translate", "translator", "weather"]],
]);

function requireDomainGroup(group) {
  if (!group || typeof group !== "object" || Array.isArray(group)) {
    throw new TypeError("group must be an object");
  }
  if (typeof group.key !== "string" || group.key.trim().length === 0) {
    throw new TypeError("group key must be a non-empty string");
  }
  if (!Array.isArray(group.tabs)) {
    throw new TypeError("group tabs must be an array");
  }
}

function normalizedDomain(value) {
  return value.trim().toLocaleLowerCase("en-US").slice(0, MAX_DOMAIN_LENGTH);
}

function exactOrSuffixRule(domain) {
  for (const [categoryId, admittedDomains] of DOMAIN_RULES) {
    for (const admittedDomain of admittedDomains) {
      if (domain === admittedDomain || domain.endsWith(`.${admittedDomain}`)) {
        return categoryId;
      }
    }
  }
  return null;
}

function titleTokens(group) {
  const tokens = new Set();
  const tabs = group.tabs.slice(0, MAX_TABS);
  for (const tab of tabs) {
    if (!tab || typeof tab.title !== "string") continue;
    const normalized = tab.title
      .slice(0, MAX_TITLE_LENGTH)
      .toLocaleLowerCase("en-US")
      .match(/[\p{L}\p{N}]+/gu) ?? [];
    for (const token of normalized) {
      tokens.add(token);
      if (tokens.size >= MAX_TOKENS) return tokens;
    }
  }
  return tokens;
}

function scoreAdmittedTokens(group) {
  const tokens = titleTokens(group);
  return TITLE_TOKEN_RULES.map(([categoryId, admittedTokens]) => ({
    categoryId,
    score: admittedTokens.reduce(
      (score, token) => score + (tokens.has(token) ? 1 : 0),
      0,
    ),
  }));
}

function bestCategory(scores) {
  let best = null;
  for (const candidate of scores) {
    if (candidate.score > 0 && (!best || candidate.score > best.score)) {
      best = candidate;
    }
  }
  return best?.categoryId ?? null;
}

export function classifyDomainGroup(group) {
  requireDomainGroup(group);
  const domainMatch = exactOrSuffixRule(normalizedDomain(group.key));
  if (domainMatch) return domainMatch;
  return bestCategory(scoreAdmittedTokens(group)) ?? OTHER_CATEGORY_ID;
}
