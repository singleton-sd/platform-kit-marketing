import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { getNamedMetaContent } from "./seo-helpers.mjs";

const repoRoot = new URL("..", import.meta.url);
const distDir = new URL("dist/", repoRoot);

const indexHtmlPath = new URL("index.html", distDir);
const notFoundHtmlPath = new URL("404.html", distDir);
const robotsTxtPath = new URL("robots.txt", distDir);
const sitemapXmlPath = new URL("sitemap.xml", distDir);
const contactHtmlPath = new URL("contact/index.html", distDir);
const waitlistHtmlPath = new URL("waitlist/index.html", distDir);
const featuresHtmlPath = new URL("features/index.html", distDir);
const privacyHtmlPath = new URL("privacy/index.html", distDir);
const termsHtmlPath = new URL("terms/index.html", distDir);
const homeMdPath = new URL("src/content/pages/home.md", repoRoot);

const SITE_DOMAIN = "https://plattform-kit.poc.singletonsd.com";

function getTextBetween(haystack, startRegex, endRegex) {
  const start = haystack.match(startRegex);
  assert(start, `Could not find start marker: ${startRegex}`);
  const sliced = haystack.slice(start.index + start[0].length);
  const end = sliced.match(endRegex);
  assert(end, `Could not find end marker: ${endRegex}`);
  return end.index === undefined ? "" : sliced.slice(0, end.index);
}

const home = await readFile(homeMdPath, "utf8");
const homeFrontmatterDescription = getTextBetween(
  home,
  /description:\s*/i,
  /\nbrand:/i,
).trim();

assert.ok(
  homeFrontmatterDescription.length <= 160,
  `Home meta description should be ≤160 chars (got ${homeFrontmatterDescription.length})`,
);

if (!existsSync(fileURLToPath(indexHtmlPath))) {
  throw new Error(
    `Missing ${indexHtmlPath.pathname}. Run pnpm build before pnpm test:seo.`,
  );
}

const [
  indexHtml,
  notFoundHtml,
  robotsTxt,
  sitemapXml,
  contactHtml,
  waitlistHtml,
  featuresHtml,
  privacyHtml,
  termsHtml,
] = await Promise.all([
  readFile(indexHtmlPath, "utf8"),
  readFile(notFoundHtmlPath, "utf8"),
  readFile(robotsTxtPath, "utf8"),
  readFile(sitemapXmlPath, "utf8"),
  readFile(contactHtmlPath, "utf8"),
  readFile(waitlistHtmlPath, "utf8"),
  readFile(featuresHtmlPath, "utf8"),
  readFile(privacyHtmlPath, "utf8"),
  readFile(termsHtmlPath, "utf8"),
]);

testMetadata("basic <title> + description", () => {
  assert.match(indexHtml, /<title>[^<]*Platform Kit[^<]*<\/title>/i);
  const description = getNamedMetaContent(indexHtml, "description");
  assert.equal(description, homeFrontmatterDescription);
});

testMetadata("canonical + robots meta", () => {
  assert.match(
    indexHtml,
    new RegExp(
      `<link\\s+rel="canonical"\\s+href="${SITE_DOMAIN.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&")}/`,
      "i",
    ),
  );
  assert.match(indexHtml, /<meta name="robots" content="index,follow"\s*\/?>/i);
});

testMetadata("404 is noindex", () => {
  assert.match(
    notFoundHtml,
    /<meta name="robots" content="noindex,follow"\s*\/?>/i,
  );
});

testMetadata("primary pages render titles", () => {
  assert.match(contactHtml, /<title>/i);
  assert.match(waitlistHtml, /<title>/i);
  assert.match(featuresHtml, /<title>/i);
  assert.match(privacyHtml, /<title>/i);
  assert.match(termsHtml, /<title>/i);
});

testMetadata("Open Graph URL uses production domain", () => {
  assert.match(
    indexHtml,
    new RegExp(`property="og:url" content="${SITE_DOMAIN}[^"]*"`, "i"),
  );
  assert.match(indexHtml, /property="og:title" content="[^"]*Platform Kit/i);
});

testMetadata("sitemap lists primary public routes", () => {
  assert.match(
    sitemapXml,
    /<loc>https:\/\/plattform-kit\.poc\.singletonsd\.com\/<\/loc>/,
  );
  assert.match(
    sitemapXml,
    /<loc>https:\/\/plattform-kit\.poc\.singletonsd\.com\/contact\/<\/loc>/,
  );
  assert.match(
    sitemapXml,
    /<loc>https:\/\/plattform-kit\.poc\.singletonsd\.com\/waitlist\/<\/loc>/,
  );
  assert.match(
    sitemapXml,
    /<loc>https:\/\/plattform-kit\.poc\.singletonsd\.com\/features\/<\/loc>/,
  );
  assert.doesNotMatch(sitemapXml, /\/admin\//i);
});

testMetadata("sitemap and robots reference production domain", () => {
  assert.match(robotsTxt, /User-agent:\s*\*/i);
  assert.match(robotsTxt, /Disallow:\s*\/admin\//i);
  assert.match(
    robotsTxt,
    /Sitemap:\s*https:\/\/plattform-kit\.poc\.singletonsd\.com\/sitemap\.xml/,
  );
});

function testMetadata(label, fn) {
  try {
    fn();
  } catch (err) {
    err.message = `${label} failed: ${err.message}`;
    throw err;
  }
}

console.log("SEO + metadata checks passed");
