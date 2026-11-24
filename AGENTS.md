# AGENTS.md — Platform Kit marketing

This repository is **public**. Never commit or post secrets, credentials, private
customer information, contracts, pricing negotiations, or commercially
sensitive planning content. The Turnstile site key is public config and may be
named as an Actions variable only.

GitHub Issues are the engineering source of truth. PR bodies use `Closes #N`
and must not include private tracker references.

## Stack and quality gate

- Astro SSG, strict TypeScript, Tailwind CSS, and Markdown content collections.
- Use semantic CSS variables from `src/styles/global.css`.
- Husky runs `pnpm format:check` + `pnpm lint` on **pre-commit**, and
  `pnpm verify` on **pre-push**.
- Keep the site fully static. Lead intake is a browser POST to
  `https://api.singletonsd.com/v1/leads`.
- Public hostname: `https://plattform-kit.poc.singletonsd.com`.

Node `>=22.12.0`, pnpm `11.22.0` (`packageManager`). CI uses Node 24.

Run every gate before each push, in CI order:

```bash
corepack enable && pnpm install --frozen-lockfile
pnpm format:check
pnpm lint
pnpm test
pnpm build
pnpm test:seo && pnpm test:a11y && pnpm test:lead-forms
```

## Layout

- Site at the repo root (history imported from `poc-plattform-kit` `apps/marketing`).
- Pages and components: `src/pages/`, `src/components/`
- Markdown collections: `src/content/pages/`
- Decap admin: `public/admin/` (`pnpm cms:config` regenerates `config.yml`)
- **Exactly one production deploy path:** `.github/workflows/pages.yml` on push
  to `main` (plus `workflow_dispatch`). PR previews live in `preview.yml`.
  Do not add a second production trigger.

## Copy

Keep public copy conservative. Do not claim unvalidated scale, performance,
revenue, or launch dates.
