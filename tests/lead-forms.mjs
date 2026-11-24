/* eslint-disable no-undef */
/**
 * Playwright: contact + waitlist POST /v1/leads (mocked).
 * Covers the former e2e/leads.spec.ts cases against a static dist.
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import http from "node:http";
import { createReadStream, existsSync, mkdirSync, statSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const rootDir = fileURLToPath(new URL("..", import.meta.url));
const defaultDistDir = path.join(rootDir, "dist");
const port = Number(process.env.LEAD_FORMS_PORT ?? 0);
const LEADS_URL = "https://api.singletonsd.com/v1/leads";

function contentTypeForPath(pathname) {
  if (pathname.endsWith(".html")) return "text/html; charset=utf-8";
  if (pathname.endsWith(".css")) return "text/css; charset=utf-8";
  if (pathname.endsWith(".js")) return "text/javascript; charset=utf-8";
  if (pathname.endsWith(".svg")) return "image/svg+xml";
  if (pathname.endsWith(".ico")) return "image/x-icon";
  if (pathname.endsWith(".xml")) return "application/xml; charset=utf-8";
  if (pathname.endsWith(".txt")) return "text/plain; charset=utf-8";
  if (pathname.endsWith(".woff2")) return "font/woff2";
  return "application/octet-stream";
}

function normalizePathname(urlPath) {
  const cleaned = urlPath.replace(/\?.*$/, "").replace(/\/+$/, "");
  if (cleaned === "") return "/index.html";
  return cleaned.startsWith("/") ? cleaned : `/${cleaned}`;
}

function resolveFsPath(root, urlPath) {
  const pathname = normalizePathname(urlPath);
  let fsPath = `${root}${pathname}`;
  if (existsSync(fsPath) && statSync(fsPath).isDirectory()) {
    fsPath = `${fsPath.replace(/\/$/, "")}/index.html`;
  }
  return {
    pathname: fsPath.startsWith(root) ? fsPath.slice(root.length) : pathname,
    fsPath,
  };
}

function createStaticServer(root) {
  return http.createServer(async (req, res) => {
    try {
      if (!req.url) {
        res.statusCode = 400;
        res.end("Bad request");
        return;
      }

      const { pathname, fsPath } = resolveFsPath(root, req.url);

      if (!existsSync(fsPath) || statSync(fsPath).isDirectory()) {
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
        res.end(await readFile(fsPath, "utf8"));
        return;
      }

      createReadStream(fsPath).pipe(res);
    } catch (err) {
      res.statusCode = 500;
      res.end(String(err));
    }
  });
}

function listen(server, preferredPort = 0) {
  return new Promise((resolve) => {
    server.listen(preferredPort, "127.0.0.1", () => {
      const address = server.address();
      assert.ok(
        address && typeof address === "object" && address.port > 0,
        "Failed to pick an available port",
      );
      resolve(address.port);
    });
  });
}

function ensureLeadFormsDist() {
  const out = path.join(rootDir, "test-results", "dist-lead-forms");
  mkdirSync(path.dirname(out), { recursive: true });
  const result = spawnSync(
    "pnpm",
    ["exec", "astro", "build", "--outDir", out],
    {
      cwd: rootDir,
      env: {
        ...process.env,
        PUBLIC_TURNSTILE_SITE_KEY:
          process.env.PUBLIC_TURNSTILE_SITE_KEY || "1x00000000000000000000AA",
        PUBLIC_LEAD_INTAKE_URL: LEADS_URL,
      },
      stdio: "inherit",
    },
  );
  if (result.status !== 0) {
    throw new Error("Failed to build lead-forms dist.");
  }
  return out;
}

function installTurnstileStub() {
  let lastCallback;
  window.turnstile = {
    render(_el, opts) {
      lastCallback = opts?.callback;
      queueMicrotask(() => opts?.callback?.("e2e-turnstile-token"));
      return "e2e-widget";
    },
    reset() {
      lastCallback?.("e2e-turnstile-token");
    },
    remove() {},
  };
}

if (!existsSync(defaultDistDir)) {
  throw new Error(
    `Missing dist directory at ${defaultDistDir}. Run pnpm build first.`,
  );
}

const leadDist = ensureLeadFormsDist();
const leadServer = createStaticServer(leadDist);
const leadPort = await listen(leadServer, port);
const origin = `http://127.0.0.1:${leadPort}`;

const browser = await chromium.launch();
const context = await browser.newContext();
await context.addInitScript(installTurnstileStub);
const page = await context.newPage();

async function mockLeads(handler) {
  const posts = [];
  await page.route("https://api.singletonsd.com/**", async (route) => {
    const request = route.request();
    if (request.method() === "OPTIONS") {
      await route.fulfill({
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Headers": "content-type,accept",
          "Access-Control-Allow-Methods": "POST,OPTIONS",
        },
      });
      return;
    }
    if (request.url().startsWith(LEADS_URL) && request.method() === "POST") {
      const body = request.postDataJSON();
      posts.push({
        url: request.url(),
        method: request.method(),
        contentType: request.headers()["content-type"],
        body,
      });
      const response = await handler(body);
      await route.fulfill({
        status: response.status,
        contentType: "application/json",
        body: JSON.stringify(response.json),
      });
      return;
    }
    await route.abort("blockedbyclient");
  });
  return posts;
}

async function fillContact(target, extras = {}) {
  await target.locator("#contact-name").fill("Ada Lovelace");
  await target.locator("#contact-email").fill("ada@example.com");
  await target
    .locator("#contact-subject")
    .selectOption(extras.subject ?? "sales");
  await target
    .locator("#contact-message")
    .fill(extras.message ?? "Please get in touch about a demo.");
  await target.locator("#contact-consent").check();
}

try {
  const successPosts = await mockLeads(async (body) => ({
    status: 202,
    json: { id: body.submissionId },
  }));

  await page.goto(`${origin}/contact/`, { waitUntil: "load" });
  await fillContact(page);
  await page.waitForFunction(
    () =>
      !document.querySelector("#contact-form button[type=submit]")?.disabled,
  );
  await page.locator("#contact-form button[type=submit]").click();
  await page.waitForSelector("#contact-success:not(.hidden)");

  assert.equal(successPosts.length, 1);
  assert.equal(successPosts[0].url, LEADS_URL);
  assert.equal(successPosts[0].method, "POST");
  assert.match(successPosts[0].contentType, /application\/json/);
  const sent = successPosts[0].body;
  assert.equal(sent.sourceSite, "https://platform-kit.singletonsd.com");
  assert.equal(sent.formType, "contact");
  assert.equal(sent.product, "platform_kit");
  assert.equal(sent.name, "Ada Lovelace");
  assert.equal(sent.email, "ada@example.com");
  assert.equal(sent.consent, true);
  assert.equal(sent.marketingOptIn, false);
  assert.equal(sent.turnstileToken, "e2e-turnstile-token");
  assert.equal(sent.consentTextVersion, "platform-kit-privacy-v1");
  assert.match(String(sent.message), /Please get in touch about a demo/);
  assert.equal("source" in sent, false);
  assert.match(sent.submissionId, /^[0-9a-f-]{36}$/i);

  await page.unroute("https://api.singletonsd.com/**");

  const waitlistPosts = await mockLeads(async (body) => ({
    status: 202,
    json: { id: body.submissionId },
  }));
  await page.goto(`${origin}/waitlist/`, { waitUntil: "load" });
  await page.locator("#waitlist-name").fill("Ada Lovelace");
  await page.locator("#waitlist-email").fill("ada@example.com");
  await page.locator("#waitlist-feature").selectOption("early_access");
  await page.locator("#waitlist-consent").check();
  await page.waitForFunction(
    () =>
      !document.querySelector("#waitlist-form button[type=submit]")?.disabled,
  );
  await page.locator("#waitlist-form button[type=submit]").click();
  await page.waitForSelector("#waitlist-success:not(.hidden)");
  assert.equal(waitlistPosts.length, 1);
  assert.equal(waitlistPosts[0].body.formType, "waitlist");
  assert.equal(waitlistPosts[0].body.product, "platform_kit");
  assert.equal(waitlistPosts[0].body.feature, "early_access");
  assert.equal(waitlistPosts[0].body.consent, true);
  assert.equal(waitlistPosts[0].body.marketingOptIn, false);

  await page.unroute("https://api.singletonsd.com/**");

  let calls = 0;
  let firstId;
  const errorPosts = await mockLeads(async (body) => {
    calls += 1;
    if (calls === 1) {
      firstId = String(body.submissionId);
      return {
        status: 400,
        json: {
          error: "payload_invalid",
          message: "body does not match the lead schema",
          details: ["email"],
        },
      };
    }
    assert.equal(body.submissionId, firstId);
    return {
      status: 404,
      json: {
        error: "function_disabled",
        message: "function lead-intake is disabled",
      },
    };
  });
  await page.goto(`${origin}/contact/`, { waitUntil: "load" });
  await fillContact(page, { subject: "general" });
  await page.waitForFunction(
    () =>
      !document.querySelector("#contact-form button[type=submit]")?.disabled,
  );
  await page.locator("#contact-form button[type=submit]").click();
  await page.waitForSelector("#contact-form-error:not(.hidden)");
  assert.match(
    await page.locator("#contact-form-error").innerText(),
    /Please fix the highlighted fields and try again/,
  );
  assert.equal(
    await page.locator("#contact-email-error").innerText(),
    "Enter a valid email address.",
  );
  await page.waitForFunction(
    () =>
      !document.querySelector("#contact-form button[type=submit]")?.disabled,
  );
  await page.locator("#contact-form button[type=submit]").click();
  await page.waitForFunction(() =>
    /Lead intake is temporarily unavailable/.test(
      document.getElementById("contact-form-error")?.innerText ?? "",
    ),
  );
  assert.match(
    await page.locator("#contact-form-error").innerText(),
    /Lead intake is temporarily unavailable/,
  );
  assert.equal(errorPosts.length, 2);

  await page.unroute("https://api.singletonsd.com/**");

  await mockLeads(async () => ({
    status: 404,
    json: {
      error: "function_disabled",
      message: "function lead-intake is disabled",
    },
  }));
  await page.goto(`${origin}/contact/`, { waitUntil: "load" });
  await fillContact(page, { subject: "general" });
  await page.waitForFunction(
    () =>
      !document.querySelector("#contact-form button[type=submit]")?.disabled,
  );
  await page.locator("#contact-form button[type=submit]").click();
  const formError = page.locator("#contact-form-error");
  await page.waitForSelector("#contact-form-error:not(.hidden)");
  assert.match(
    await formError.innerText(),
    /Lead intake is temporarily unavailable/,
  );
  assert.equal(
    await page
      .locator("#contact-success")
      .evaluate((el) => el.classList.contains("hidden")),
    true,
  );
  await page
    .locator("#contact-message")
    .fill("Please get in touch about a demo. Updated.");
  assert.match(
    await formError.innerText(),
    /Lead intake is temporarily unavailable/,
  );
  assert.equal(
    await formError.evaluate((el) => el.classList.contains("hidden")),
    false,
  );

  const noJsContext = await browser.newContext({ javaScriptEnabled: false });
  const noJsPage = await noJsContext.newPage();
  try {
    await noJsPage.goto(`${origin}/contact/`, {
      waitUntil: "domcontentloaded",
    });
    assert.match(
      await noJsPage.locator("#contact-form").getAttribute("method"),
      /post/i,
    );
    assert.equal(
      await noJsPage.locator("#contact-form button[type=submit]").isDisabled(),
      true,
    );
    const contactHtml = await noJsPage.content();
    assert.match(contactHtml, /<noscript>/i);
    assert.match(contactHtml, /support@singletonsd.com/);

    await noJsPage.goto(`${origin}/waitlist/`, {
      waitUntil: "domcontentloaded",
    });
    assert.match(
      await noJsPage.locator("#waitlist-form").getAttribute("method"),
      /post/i,
    );
    assert.equal(
      await noJsPage.locator("#waitlist-form button[type=submit]").isDisabled(),
      true,
    );
    const waitlistHtml = await noJsPage.content();
    assert.match(waitlistHtml, /<noscript>/i);
    assert.match(waitlistHtml, /support@singletonsd.com/);
  } finally {
    await noJsContext.close();
  }

  console.log("lead-forms: ok");
} finally {
  await browser.close();
  await new Promise((resolve) => leadServer.close(resolve));
}
