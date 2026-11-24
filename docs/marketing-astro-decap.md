# Marketing site — Astro + Decap

Locked stack for `plattform-kit.poc.singletonsd.com` (GitHub Pages; house pattern matches [`poc-inkads-marketing`](https://github.com/singleton-sd/poc-inkads-marketing)).

## Stack

| Layer          | Choice                                                                                                                                                 |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| SSG            | **Astro** (repo root) — Markdown → static `dist/`                                                                                                      |
| Styling        | **Tailwind 3** + `@singleton-sd/tokens` (`--ssd-*` CSS; npm, not the token CDN)                                                                        |
| Content        | Markdown collections under `src/content/pages/`                                                                                                        |
| Non-dev editor | **Decap CMS** static UI at `/admin` (GitHub backend)                                                                                                   |
| OAuth login    | Shared org **cms-auth** gateway (`https://api.singletonsd.com`, `auth_endpoint: v1/cms-auth/auth`). This repo is **not** the org Decap OAuth provider. |
| Lead intake    | Browser `POST` to `https://api.singletonsd.com/v1/leads`                                                                                               |
| Deploy site    | `pages.yml` → `gh-pages` branch (GitHub Pages). PRs: `preview.yml` at `/pr-preview/pr-<n>/`                                                            |

No WordPress, Gatsby, or always-on CMS server for the site itself.

### GitHub Pages routes

Astro emits directory URLs (`features/index.html`) and `/404.html`. GitHub Pages
serves `/features` and `/features/` from the directory index, and unknown paths
at the **site root** from `/404.html`.

PR previews set `PREVIEW_BASE_PATH=/pr-preview/pr-<n>/` so bundled `_astro/`
assets and in-app links resolve under that subpath. Decap `/admin` keeps
production-absolute `/admin/…` URLs — use the custom domain for CMS login, not
a preview URL.

## How Decap fits Astro

1. Editors open `/admin` (static SPA shipped in `public/admin/`).
2. `admin/index.html` sets `rel="cms-config-url"` to `/admin/config.yml` (needed when the URL has no trailing slash) and loads Decap at the end of `<body>` so `document.body` exists.
3. Login with GitHub via the **shared** cms-auth gateway (`base_url: https://api.singletonsd.com` in `config.yml`).
4. Decap reads/writes Markdown in git via the **GitHub API** (editorial workflow → PRs).
5. Merge to `main` runs Astro build; GitHub Pages serves the new HTML from `gh-pages`.
6. Decap does **not** talk to Astro at runtime.

## Admin UI customization

Decap has **no official admin chrome theme API**. Colors live in
[`decap-cms-ui-default/src/styles.js`](https://github.com/decaporg/decap-cms/blob/main/packages/decap-cms-ui-default/src/styles.js)
and are internal ([issue #1727](https://github.com/decaporg/decap-cms/issues/1727)).
Maintainers endorse CSS overrides ([discussion #7353](https://github.com/decaporg/decap-cms/discussions/7353));
class names can change across releases.

Supported Decap hooks we use:

| Hook                                   | File / config                                           |
| -------------------------------------- | ------------------------------------------------------- |
| CDN install (pinned)                   | `public/admin/index.html` → `decap-cms@3.15.1` (no `^`) |
| `logo` / `show_in_header`              | `public/admin/config.yml` + `brand-mark.svg`            |
| `CMS.registerPreviewStyle`             | `admin-preview.js` → `/admin/preview.css`               |
| `CMS.registerPreviewTemplate('pages')` | `admin-preview.js`                                      |
| Built-in widgets + hints               | `config.yml` fields                                     |

Product theme layers:

| Layer            | Role                                                                                           |
| ---------------- | ---------------------------------------------------------------------------------------------- |
| `admin.css`      | Maintainer-endorsed CSS overrides (solid `--pk-*` surfaces, nav vs CTA, editor)                |
| `admin-theme.js` | Unofficial Emotion hex remapper for `styles.js` `colorsRaw` leftovers; re-runs on `hashchange` |
| `preview.css`    | Preview iframe only (official `registerPreviewStyle` target)                                   |

`astro.config.mjs` copies `@singleton-sd/tokens` CSS into `public/admin/tokens/` so the static admin SPA can `@import` it (no token CDN).

Pin the Decap version when changing overrides. Do not float `@^3.0.0`.

### Hosting

| Piece               | Extra host?                                                            |
| ------------------- | ---------------------------------------------------------------------- |
| Decap UI `/admin`   | No — same GitHub Pages site                                            |
| Markdown content    | No — GitHub                                                            |
| Astro site          | No — CI build + GitHub Pages                                           |
| GitHub OAuth login  | **Yes** — shared org gateway `https://api.singletonsd.com/v1/cms-auth` |
| Marketing lead HTTP | **Yes** — shared `https://api.singletonsd.com/v1/leads`                |

### Decap OAuth (shared)

PK consumes the org cms-auth gateway at `https://api.singletonsd.com`. Do not add `/auth` or `/callback` in this repo. The OAuth callback (`https://api.singletonsd.com/v1/cms-auth/callback`) is configured on the gateway and GitHub OAuth App.

The gateway allowlist currently includes `https://plattform-kit.poc.singletonsd.com`. OAuth scope is `public_repo`. Do not assume other hosts (localhost, `*.azurestaticapps.net`, or `*.github.io`) are allowed.

GitHub OAuth App: [Singleton SD CMS OAuth](https://github.com/settings/applications/3783537) (callback `https://api.singletonsd.com/v1/cms-auth/callback`). Do **not** create a Platform Kit OAuth App.

Open `/admin` only on a hostname allowed by the gateway origin list. Do **not** test GitHub login on a PR preview path (`/pr-preview/pr-<n>/`) — Decap’s `/admin` URLs are production-absolute.

`config.yml`:

```yaml
backend:
  name: github
  repo: singleton-sd/platform-kit-marketing
  branch: main
  base_url: https://api.singletonsd.com
  auth_endpoint: v1/cms-auth/auth
```

### Lead intake

Contact and waitlist forms `POST` JSON to `https://api.singletonsd.com/v1/leads`
(job-kit contract). Cloudflare Turnstile runs in the browser. There is no
server in this repo.

### Human bootstrap (once)

1. Confirm the gateway auth route: opening `/admin` starts a popup to `https://api.singletonsd.com/v1/cms-auth/auth`.
2. Open `https://plattform-kit.poc.singletonsd.com/admin` → Login with GitHub (custom domain only).

Editors need **write** access to `singleton-sd/platform-kit-marketing`.

## Content model

Decap **Pages** collection allows creating new Markdown entries (`create: true`).
Home stays on `/` via `src/pages/index.astro`; every other slug is built by
`src/pages/[slug].astro` (e.g. `/privacy`, `/terms`, or a new `/about`).
Unknown paths hit `src/pages/404.astro` (`404.html`) via GitHub Pages’
root 404 handler — not a homepage SPA fallback.

| File                           | Purpose                                        |
| ------------------------------ | ---------------------------------------------- |
| `src/content/pages/home.md`    | Landing brand, headline, CTA, body             |
| `src/content/pages/privacy.md` | Privacy Policy                                 |
| `src/content/pages/terms.md`   | Terms of Service                               |
| `src/content/pages/<slug>.md`  | Any additional page editors create in `/admin` |

## Repo paths

- App: repository root
- Admin: `public/admin/`
- Shared Decap OAuth: `https://api.singletonsd.com/v1/cms-auth` (org cms-auth gateway)
- Lead intake: `https://api.singletonsd.com/v1/leads`
- Deploy site: `.github/workflows/pages.yml` (production) / `.github/workflows/preview.yml` (PR previews)
- Local: `pnpm dev`
