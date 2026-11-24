# platform-kit-marketing

Public marketing site for Platform Kit, served at
[https://plattform-kit.poc.singletonsd.com](https://plattform-kit.poc.singletonsd.com).

The site moved here from [`poc-plattform-kit`](https://github.com/singleton-sd/poc-plattform-kit)
`apps/marketing`, with git history rewritten so the app sits at this repo root.

## Run locally

Node `>=22.12.0` and pnpm `11.22.0` (`packageManager` in `package.json`).

```bash
corepack enable
pnpm install
pnpm dev
```

Optional public Turnstile site key (never the secret):

```bash
cp .env.example .env
```

## Scripts

| Script | Purpose |
| --- | --- |
| `pnpm dev` | Astro dev server |
| `pnpm build` | Type-check, static build, sitemap, asset-path check |
| `pnpm preview` | Serve `dist/` |
| `pnpm test` | Unit tests under `tests/*.test.mjs` |
| `pnpm verify` | Format, lint, unit tests, build, SEO, a11y |

Production deploys from `main` via `.github/workflows/pages.yml` onto the
`gh-pages` branch. PR previews land under `/pr-preview/pr-<n>/` on the same
Pages site.
