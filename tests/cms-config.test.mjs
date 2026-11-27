import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("generated Decap config matches the committed file", async () => {
  const configPath = new URL("public/admin/config.yml", root);
  const committed = await readFile(configPath, "utf8");

  execFileSync(
    process.execPath,
    ["--experimental-strip-types", "scripts/generate-cms-config.ts"],
    { cwd: fileURLToPath(root), stdio: "pipe" },
  );
  execFileSync(
    "pnpm",
    ["exec", "prettier", "--write", "public/admin/config.yml"],
    {
      cwd: fileURLToPath(root),
      stdio: "pipe",
    },
  );

  const generated = await readFile(configPath, "utf8");
  assert.equal(generated, committed);
});

test("Decap CMS admin script is version-pinned", async () => {
  const html = await readFile(new URL("public/admin/index.html", root), "utf8");
  assert.match(html, /unpkg\.com\/decap-cms@3\.15\.1\/dist\/decap-cms\.js/);
  assert.doesNotMatch(html, /decap-cms@\^/);
});

test("Decap pages collection targets this repo at the site root", async () => {
  const config = await readFile(
    new URL("public/admin/config.yml", root),
    "utf8",
  );

  assert.match(config, /name: pages/);
  assert.match(config, /repo: singleton-sd\/platform-kit-marketing/);
  assert.doesNotMatch(config, /poc-plattform-kit/);
  assert.match(config, /folder: src\/content\/pages/);
  assert.match(config, /media_folder: public\/uploads/);
  assert.match(config, /base_url: https:\/\/api\.singletonsd\.com/);
  assert.match(config, /auth_endpoint: v1\/cms-auth\/auth/);
  assert.match(config, /branch: main/);
});
