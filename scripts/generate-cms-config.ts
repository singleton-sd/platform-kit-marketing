import { writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = fileURLToPath(new URL("..", import.meta.url));
const outPath = path.join(rootDir, "public/admin/config.yml");

/** GitHub repo Decap commits to. Commit E points this at the standalone site. */
const BACKEND_REPO = "singleton-sd/poc-plattform-kit";
const MEDIA_FOLDER = "apps/marketing/public/uploads";
const PAGES_FOLDER = "apps/marketing/src/content/pages";

const config = `# Decap CMS — git-backed editor for marketing Markdown.
# Auth: org cms-auth gateway at https://api.singletonsd.com
# (auth_endpoint: v1/cms-auth/auth). Do not host OAuth in this repo.
# Docs: docs/marketing-astro-decap.md
backend:
  name: github
  repo: ${BACKEND_REPO}
  branch: main
  base_url: https://api.singletonsd.com
  auth_endpoint: v1/cms-auth/auth

# Prefer PRs so human merge still gates production publish.
publish_mode: editorial_workflow

logo:
  src: /admin/brand-mark.svg
  show_in_header: true

site_url: https://plattform-kit.poc.singletonsd.com
display_url: https://plattform-kit.poc.singletonsd.com

media_folder: ${MEDIA_FOLDER}
public_folder: /uploads

collections:
  - name: pages
    label: Pages
    folder: ${PAGES_FOLDER}
    create: true
    delete: false
    slug: "{{slug}}"
    extension: md
    format: frontmatter
    # Flat fields stay compatible with Astro content schema (no nested objects).
    fields:
      - label: Title
        name: title
        widget: string
        hint: Page title (browser tab / SEO).
      - label: Description
        name: description
        widget: text
        required: false
        hint: Short meta description for SEO.
      - label: Brand
        name: brand
        widget: string
        required: false
        hint: Hero brand line (e.g. Platform Kit).
      - label: Headline
        name: headline
        widget: string
        required: false
        hint: Supporting headline under the brand.
      - label: CTA label
        name: ctaLabel
        widget: string
        required: false
      - label: CTA URL
        name: ctaUrl
        widget: string
        required: false
        hint: Absolute or site-relative URL for the primary button.
      - label: Last updated
        name: updated
        widget: string
        required: false
        hint: Display date string (e.g. 8 August 2026).
      - label: Body
        name: body
        widget: markdown
`;

writeFileSync(outPath, config, "utf8");
console.log(`Generated ${outPath}`);
