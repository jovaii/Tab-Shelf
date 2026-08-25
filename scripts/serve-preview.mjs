import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { dirname, extname, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const SCRIPT_ROOT = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(SCRIPT_ROOT, "..");
const EXTENSION_ROOT = resolve(PROJECT_ROOT, "extension");
const APPROVAL_ROOT = resolve(PROJECT_ROOT, "docs/approvals");
const FIXTURE_PATH = resolve(PROJECT_ROOT, "tests/fixtures/tabs.json");
const RUNTIME_PATH = resolve(SCRIPT_ROOT, "preview-runtime.js");
const PREVIEW_SCRIPTS = [
  '<script src="/__preview__/fixture.js?preview=1"></script>',
  '<script src="/__preview__/runtime.js?preview=1"></script>',
].join("\n    ");
const CONTENT_TYPES = Object.freeze({
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".png": "image/png",
});

export function injectPreviewBootstrap(html, requestUrl) {
  if (requestUrl.searchParams.get("preview") !== "1") return html;
  const moduleScript = /<script\s+type="module"/u;
  if (!moduleScript.test(html)) return html;
  return html.replace(moduleScript, `${PREVIEW_SCRIPTS}\n    <script type="module"`);
}

function parseArguments(argumentsList) {
  const options = { host: "127.0.0.1", port: 4173 };
  for (let index = 0; index < argumentsList.length; index += 1) {
    const argument = argumentsList[index];
    if (argument === "--host") options.host = argumentsList[index += 1];
    else if (argument === "--port") options.port = Number(argumentsList[index += 1]);
    else throw new TypeError(`Unknown preview option: ${argument}`);
  }
  if (!["127.0.0.1", "localhost", "::1"].includes(options.host)) {
    throw new TypeError("Preview host must remain on this Mac");
  }
  if (!Number.isInteger(options.port) || options.port < 1024 || options.port > 65535) {
    throw new TypeError("Preview port must be an integer from 1024 through 65535");
  }
  return options;
}

function pathInside(root, relative) {
  const absolute = resolve(root, relative);
  if (!absolute.startsWith(`${root}${sep}`)) return null;
  return absolute;
}

export function resolveStaticPath(pathname) {
  const relative = decodeURIComponent(pathname === "/" ? "/shelf.html" : pathname).replace(/^\/+/, "");
  const approvalPrefix = "docs/approvals/";
  if (relative.startsWith(approvalPrefix)) {
    return pathInside(APPROVAL_ROOT, relative.slice(approvalPrefix.length));
  }
  return pathInside(EXTENSION_ROOT, relative);
}

function headers(contentType) {
  return {
    "cache-control": "no-store",
    "content-security-policy": "default-src 'self' data: blob:; img-src 'self' data:; script-src 'self'; style-src 'self' 'unsafe-inline'; object-src 'none'; base-uri 'none'",
    "content-type": contentType,
    "x-content-type-options": "nosniff",
  };
}

async function previewFixtureSource() {
  const tabs = JSON.parse(await readFile(FIXTURE_PATH, "utf8"));
  return `globalThis.__TAB_SHELF_FIXTURE__ = { tabs: ${JSON.stringify(tabs)} };\n`;
}

async function respond(request, response) {
  const requestUrl = new URL(request.url ?? "/", "http://127.0.0.1");
  try {
    if (requestUrl.searchParams.get("preview") === "1"
      && requestUrl.pathname === "/__preview__/fixture.js") {
      response.writeHead(200, headers("text/javascript; charset=utf-8"));
      response.end(await previewFixtureSource());
      return;
    }
    if (requestUrl.searchParams.get("preview") === "1"
      && requestUrl.pathname === "/__preview__/runtime.js") {
      response.writeHead(200, headers("text/javascript; charset=utf-8"));
      response.end(await readFile(RUNTIME_PATH));
      return;
    }

    const path = resolveStaticPath(requestUrl.pathname);
    if (!path) {
      response.writeHead(404, headers("text/plain; charset=utf-8"));
      response.end("Not found\n");
      return;
    }
    const extension = extname(path).toLocaleLowerCase("en-US");
    let body = await readFile(path);
    if (extension === ".html") {
      body = Buffer.from(injectPreviewBootstrap(body.toString("utf8"), requestUrl));
    }
    response.writeHead(200, headers(CONTENT_TYPES[extension] ?? "application/octet-stream"));
    response.end(body);
  } catch {
    response.writeHead(404, headers("text/plain; charset=utf-8"));
    response.end("Not found\n");
  }
}

export function startPreviewServer({ host = "127.0.0.1", port = 4173 } = {}) {
  const options = parseArguments(["--host", host, "--port", String(port)]);
  const server = createServer((request, response) => {
    void respond(request, response);
  });
  return new Promise((resolvePromise, rejectPromise) => {
    server.once("error", rejectPromise);
    server.listen(options.port, options.host, () => {
      server.off("error", rejectPromise);
      resolvePromise(server);
    });
  });
}

const launchedDirectly = process.argv[1]
  && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (launchedDirectly) {
  const options = parseArguments(process.argv.slice(2));
  const server = await startPreviewServer(options);
  process.stdout.write(`Tab Shelf preview: http://${options.host}:${options.port}/shelf.html?preview=1\n`);
  const close = () => server.close(() => process.exit(0));
  process.once("SIGINT", close);
  process.once("SIGTERM", close);
}
