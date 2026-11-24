import { defineConfig } from "astro/config";
import tailwind from "@astrojs/tailwind";
import { copyMarketingTokenCss } from "./scripts/copy-token-css.mjs";
import { rehypePrefixBase } from "./src/lib/rehype-prefix-base.mjs";

copyMarketingTokenCss();

const environment = /** @type {Record<string, string | undefined>} */ (
  Reflect.get(globalThis, "process")?.env ?? {}
);
const previewBase = environment.PREVIEW_BASE_PATH;
const base = previewBase && previewBase.length > 0 ? previewBase : "/";

// Astro static marketing site (GitHub Pages; PR previews set PREVIEW_BASE_PATH)
export default defineConfig({
  site: "https://platform-kit.singletonsd.com",
  base,
  output: "static",
  integrations: [
    tailwind({
      applyBaseStyles: false,
    }),
  ],
  markdown: {
    rehypePlugins: [[rehypePrefixBase, { base }]],
  },
});
