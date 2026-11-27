/**
 * Escape a string so it can be used as a literal in a RegExp source.
 * Keep this regex as a top-level literal so Prettier does not rewrite
 * `[\]\\]` into a class that fails to escape parentheses.
 */
const REGEXP_METACHARACTERS = /[.*+?^${}()|[\]\\]/g;

export function escapeRegExp(value) {
  return value.replace(REGEXP_METACHARACTERS, "\\$&");
}

function decodeHtmlEntities(value) {
  return value
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">");
}

/**
 * Read HTML attributes as complete names outside quoted values.
 * `data-name` is not `name`; `name="…"` inside another attribute's value is ignored.
 */
function readAttributes(tag) {
  const body = tag.replace(/^<\s*meta\b/i, "").replace(/\/?>$/i, "");
  const attrs = new Map();
  const attrPattern =
    /([^\s=<>/]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  for (const match of body.matchAll(attrPattern)) {
    attrs.set(match[1].toLowerCase(), match[2] ?? match[3] ?? match[4] ?? "");
  }
  return attrs;
}

/**
 * Return the decoded content of `<meta name="{name}">`, ignoring
 * `property="og:description"` and other meta tags.
 */
export function getNamedMetaContent(html, name) {
  for (const match of html.matchAll(/<meta\b[^>]*>/gi)) {
    const attrs = readAttributes(match[0]);
    if (attrs.get("name") !== name) continue;
    if (!attrs.has("content")) return undefined;
    return decodeHtmlEntities(attrs.get("content") ?? "");
  }
  return undefined;
}
