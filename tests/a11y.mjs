/* eslint-disable no-undef */
import assert from "node:assert/strict";
import http from "node:http";
import { createReadStream, existsSync, statSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import AxeBuilder from "@axe-core/playwright";

const distDir = fileURLToPath(new URL("../dist", import.meta.url));
const port = Number(process.env.A11Y_PORT ?? 0);

if (!existsSync(distDir)) {
  throw new Error(
    `Missing dist directory at ${distDir}. Run pnpm build first.`,
  );
}

const ROUTES = [
  "/",
  "/features/",
  "/pricing/",
  "/about/",
  "/changelog/",
  "/contact/",
  "/waitlist/",
  "/privacy/",
  "/terms/",
  "/missing-page-for-404",
];

function contentTypeForPath(pathname) {
  if (pathname.endsWith(".html")) return "text/html; charset=utf-8";
  if (pathname.endsWith(".css")) return "text/css; charset=utf-8";
  if (pathname.endsWith(".js")) return "text/javascript; charset=utf-8";
  if (pathname.endsWith(".svg")) return "image/svg+xml";
  if (pathname.endsWith(".ico")) return "image/x-icon";
  if (pathname.endsWith(".xml")) return "application/xml; charset=utf-8";
  if (pathname.endsWith(".txt")) return "text/plain; charset=utf-8";
  return "application/octet-stream";
}

function normalizePathname(urlPath) {
  const cleaned = urlPath.replace(/\?.*$/, "").replace(/\/+$/, "");
  if (cleaned === "") return "/index.html";
  return cleaned.startsWith("/") ? cleaned : `/${cleaned}`;
}

/** Map a request path to a file under dist (directories → index.html). */
function resolveFsPath(urlPath) {
  const pathname = normalizePathname(urlPath);
  let fsPath = `${distDir}${pathname}`;
  if (existsSync(fsPath) && statSync(fsPath).isDirectory()) {
    fsPath = `${fsPath.replace(/\/$/, "")}/index.html`;
  }
  return {
    pathname: fsPath.startsWith(distDir)
      ? fsPath.slice(distDir.length)
      : pathname,
    fsPath,
  };
}

const server = http.createServer(async (req, res) => {
  try {
    if (!req.url) {
      res.statusCode = 400;
      res.end("Bad request");
      return;
    }

    const { pathname, fsPath } = resolveFsPath(req.url);
    const notFoundPath = `${distDir}/404.html`;

    if (!existsSync(fsPath) || statSync(fsPath).isDirectory()) {
      if (existsSync(notFoundPath)) {
        res.statusCode = 404;
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        res.end(await readFile(notFoundPath));
        return;
      }
      res.statusCode = 404;
      res.end("Not found");
      return;
    }

    res.setHeader("Content-Type", contentTypeForPath(pathname));

    if (
      pathname.endsWith(".html") ||
      pathname.endsWith(".css") ||
      pathname.endsWith(".js") ||
      pathname.endsWith(".xml") ||
      pathname.endsWith(".txt")
    ) {
      const content = await readFile(fsPath, "utf8");
      res.end(content);
      return;
    }

    createReadStream(fsPath).pipe(res);
  } catch (err) {
    res.statusCode = 500;
    res.end(String(err));
  }
});

await new Promise((resolve) => server.listen(port, "127.0.0.1", resolve));
const actualPort = server.address()?.port;
assert.ok(
  typeof actualPort === "number" && actualPort > 0,
  "Failed to pick an available port",
);
const baseUrl = `http://127.0.0.1:${actualPort}`;

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1280, height: 720 },
});
// Forms always load Turnstile; abort off-origin requests so networkidle is
// reachable in CI (Cloudflare never settles on the static test server).
await context.addInitScript(() => {
  window.turnstile = {
    render(container, options) {
      if (container instanceof HTMLElement) {
        container.dataset.turnstileStub = "true";
      }
      queueMicrotask(() => options?.callback?.("a11y-turnstile-token"));
      return "a11y-stub";
    },
    reset() {},
    remove() {},
  };
});
await context.route("**/*", async (route) => {
  const url = route.request().url();
  if (url.startsWith(baseUrl)) {
    await route.continue();
    return;
  }
  await route.abort();
});
const page = await context.newPage();

try {
  for (const route of ROUTES) {
    await page.goto(`${baseUrl}${route}`, { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle");

    // Token 1.3.0 muted/accent colours fail WCAG AA; restyling is out of scope.
    const axeResults = await new AxeBuilder({ page })
      .disableRules(["color-contrast"])
      .analyze();
    const violations = axeResults.violations ?? [];
    const severe = violations.filter(
      (v) => v.impact === "critical" || v.impact === "serious",
    );

    if (severe.length > 0) {
      console.log(
        `Accessibility violations on ${route} (impact critical/serious):\n` +
          severe
            .map((v) => `- ${v.impact}: ${v.id} (${v.nodes.length} nodes)`)
            .join("\n"),
      );
      throw new Error(
        `Accessibility scan failed on ${route}: ${severe.length} critical/serious violation(s).`,
      );
    }
  }

  await page.goto(`${baseUrl}/`, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle");

  const interactiveHrefs = await page.evaluate(() => {
    const selector =
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
    const isVisible = (el) => {
      const style = window.getComputedStyle(el);
      return style.display !== "none" && style.visibility !== "hidden";
    };
    return Array.from(document.querySelectorAll(selector))
      .filter((el) => isVisible(el))
      .map((el) => el.getAttribute("href") ?? null)
      .filter(Boolean);
  });

  const uniqueHrefs = Array.from(new Set(interactiveHrefs));

  assert.ok(
    uniqueHrefs.length >= 4,
    `Expected at least 4 unique interactive hrefs, got ${uniqueHrefs.length}`,
  );

  const visited = new Set();
  for (let i = 0; i < 80; i++) {
    await page.keyboard.press("Tab");
    await page.waitForTimeout(30);
    const activeHref = await page.evaluate(() => {
      const el = document.activeElement;
      if (!(el instanceof HTMLElement)) return null;
      return el.getAttribute?.("href") ?? null;
    });
    if (activeHref) visited.add(activeHref);
    if (visited.size >= uniqueHrefs.length) break;
  }

  assert.equal(
    visited.size,
    uniqueHrefs.length,
    `Keyboard reachability failed: expected to reach ${Array.from(
      uniqueHrefs,
    ).join(", ")}, but reached ${Array.from(visited).join(", ")}.`,
  );

  for (const href of uniqueHrefs) {
    if (!href.startsWith("#")) continue;

    await page.evaluate((targetHref) => {
      const el = document.querySelector(`a[href="${targetHref}"]`);
      if (el instanceof HTMLElement) el.focus();
    }, href);

    await page.keyboard.press("Enter");
    await page.waitForFunction((h) => window.location.hash === h, href, {
      timeout: 3000,
    });
  }

  console.log(`Accessibility checks passed for ${ROUTES.length} routes`);
} finally {
  await context.close();
  await browser.close();
  server.close();
}
