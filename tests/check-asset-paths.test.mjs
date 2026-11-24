import assert from "node:assert/strict";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  checkBuiltAssetPaths,
  checkDistNoJekyll,
  checkPrefixedPath,
  findAssetPathErrors,
} from "../scripts/check-asset-paths.mjs";

test("checkPrefixedPath accepts root-relative production URLs", () => {
  assert.equal(checkPrefixedPath("/_astro/page.js", "/"), null);
  assert.equal(checkPrefixedPath("/images/about/mission.png", "/"), null);
  assert.equal(checkPrefixedPath("https://cdn.example/x.js", "/"), null);
});

test("checkPrefixedPath allows production-absolute /admin/ even under a preview base", () => {
  assert.equal(
    checkPrefixedPath("/admin/config.yml", "/pr-preview/pr-9/"),
    null,
  );
  assert.equal(checkPrefixedPath("/admin/", "/"), null);
});

test("checkPrefixedPath rejects preview paths in a production build", () => {
  assert.match(
    checkPrefixedPath("/pr-preview/pr-1/_astro/page.js", "/") ?? "",
    /must not use a preview subpath/,
  );
});

test("checkPrefixedPath requires the preview prefix when base is a subpath", () => {
  const base = "/pr-preview/pr-9/";
  assert.equal(
    checkPrefixedPath("/pr-preview/pr-9/_astro/page.js", base),
    null,
  );
  assert.equal(checkPrefixedPath("/pr-preview/pr-9/features", base), null);
  assert.match(
    checkPrefixedPath("/_astro/page.js", base) ?? "",
    /expected prefix/,
  );
  assert.match(checkPrefixedPath("/features", base) ?? "", /expected prefix/);
});

test("findAssetPathErrors scans src and href", () => {
  const html =
    '<link href="/_astro/a.css"/><script src="/_astro/a.js"></script>';
  assert.deepEqual(findAssetPathErrors(html, "/", "index.html"), []);
  const previewErrors = findAssetPathErrors(
    html,
    "/pr-preview/pr-1/",
    "index.html",
  );
  assert.equal(previewErrors.length, 2);
});

test("checkBuiltAssetPaths walks a dist tree", () => {
  const root = mkdtempSync(join(tmpdir(), "mkt-assets-"));
  try {
    mkdirSync(join(root, "features"), { recursive: true });
    writeFileSync(
      join(root, "index.html"),
      '<html><link href="/_astro/index.css"/><script src="/_astro/index.js"></script></html>',
    );
    writeFileSync(
      join(root, "features/index.html"),
      '<html><a href="/features">self</a><img src="/images/x.png"/></html>',
    );
    writeFileSync(join(root, ".nojekyll"), "");
    assert.deepEqual(checkBuiltAssetPaths({ dir: root, base: "/" }), []);

    const previewRoot = mkdtempSync(join(tmpdir(), "mkt-assets-preview-"));
    try {
      writeFileSync(
        join(previewRoot, "index.html"),
        '<html><link href="/pr-preview/pr-4/_astro/index.css"/><script src="/pr-preview/pr-4/_astro/index.js"></script><a href="/pr-preview/pr-4/features">F</a></html>',
      );
      writeFileSync(join(previewRoot, ".nojekyll"), "");
      assert.deepEqual(
        checkBuiltAssetPaths({ dir: previewRoot, base: "/pr-preview/pr-4/" }),
        [],
      );
      const bad = checkBuiltAssetPaths({ dir: previewRoot, base: "/" });
      assert.ok(bad.some((line) => line.includes("preview subpath")));
    } finally {
      rmSync(previewRoot, { recursive: true, force: true });
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("checkDistNoJekyll fails when the marker is missing", () => {
  const root = mkdtempSync(join(tmpdir(), "mkt-nojekyll-"));
  try {
    assert.match(checkDistNoJekyll(root)[0] ?? "", /\.nojekyll/);
    writeFileSync(join(root, ".nojekyll"), "");
    assert.deepEqual(checkDistNoJekyll(root), []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("checkBuiltAssetPaths fails when dist/.nojekyll is missing", () => {
  const root = mkdtempSync(join(tmpdir(), "mkt-nojekyll-html-"));
  try {
    writeFileSync(
      join(root, "index.html"),
      '<html><link href="/_astro/index.css"/><script src="/_astro/index.js"></script></html>',
    );
    const errors = checkBuiltAssetPaths({ dir: root, base: "/" });
    assert.ok(errors.some((line) => line.includes(".nojekyll")));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("Pages workflows keep hidden dist files and recreate .nojekyll", () => {
  const pages = readFileSync(
    new URL("../.github/workflows/pages.yml", import.meta.url),
    "utf8",
  );
  const preview = readFileSync(
    new URL("../.github/workflows/preview.yml", import.meta.url),
    "utf8",
  );

  assert.match(pages, /path:\s*dist\n\s*include-hidden-files:\s*true/);
  assert.match(preview, /path:\s*dist\n\s*include-hidden-files:\s*true/);
  assert.match(pages, /touch dist\/\.nojekyll/);
  assert.match(preview, /touch dist\/\.nojekyll/);
  assert.match(pages, /test -f dist\/\.nojekyll/);
  assert.match(preview, /test -f dist\/\.nojekyll/);
});
