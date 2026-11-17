# Repository Guidelines

## Project Mission & AI/Human Handoff

This repository is evolving from a public law-office website into a private, mobile-first legal productivity app. Before product or architecture changes, read `docs/PLANO_EXECUCAO_MARCIA.md` and the relevant document linked there. The plan is the canonical source for status, decisions, open questions, research and restart instructions. Update its status and literal next step when a milestone changes.

- Product north star: make Márcia's frequent legal-office tasks easy, fast, trustworthy and accessible. Validate screen order and language with Márcia.
- Current website is public marketing only. Do not put private clients, cases, court documents, credentials, finance or production data in the static site/GitHub Pages.
- The two supplied ZIPs contain sensitive legal/personal information. Never copy their contents into the repo, synthetic fixtures, prompts, screenshots, tests, logs or agent outputs. Use fabricated data only.
- All integrations and AI answers need traceable sources, timestamps, permissions and explicit error states. AI can propose; a lawyer confirms deadlines, legal conclusions, signatures and external publication.
- Research citations belong in `docs/plano/02_PESQUISA_EVIDENCIAS.md`, with direct source links, access date, supported claim and limitation. Recheck terms/API coverage before implementation.
- Keep root instructions short and stable. Path-specific rules belong in nested `AGENTS.md`; `CLAUDE.md` imports the matching `AGENTS.md` with `@AGENTS.md` so the tools share one canonical set.
- For parallel work, assign non-overlapping folders and bounded outcomes. The primary agent reviews changes, resolves conflicts and owns integration.

## Project Structure & Module Organization

This repository is a pnpm TypeScript monorepo. The root `src/` and `dist/` are the existing public Vite/React marketing site; it remains separately deployed by `.github/workflows/pages.yml` and must never receive authenticated client/case data or secrets. `apps/mobile/` is the private Expo/React Native web + Android + iOS app. `apps/api/` is the Cloudflare Worker/D1 backend. `packages/contracts/` contains shared Zod contracts. Plans and research live in `docs/`. Use the nested `AGENTS.md` before changing a package.

## Build, Test, and Development Commands

Use `.node-version`, the root `package.json` `packageManager`, `pnpm-lock.yaml`, and Expo's SDK compatibility matrix.

- `pnpm install --frozen-lockfile` installs the exact locked dependency set.
- `pnpm dev` starts Vite with hot reload on port 3000.
- `pnpm build` creates the production bundle in `dist/`.
- `pnpm preview` serves the public site build locally.
- `pnpm lint` and `pnpm test` validate the root public site.
- `pnpm --filter @marcia/contracts typecheck`, `pnpm --filter @marcia/api typecheck`/`build`, and `pnpm --filter @marcia/mobile typecheck`/`lint`/`export:web` validate product packages.
- API/mobile local auth and data setup are documented in their package READMEs. `.github/workflows/ci.yml` checks packages; Pages publication remains separate.

## Coding Style & Naming Conventions

Follow the existing two-space indentation, double quotes, semicolons, and trailing commas. Use PascalCase for React component files and exports (`PracticeAreas.tsx`), `use-` prefixed kebab-case for hooks (`use-mobile.tsx`), and camelCase for variables and helpers. Prefer the `@/` alias for imports from `src`. Compose styling with Tailwind utilities and existing design tokens in `src/index.css` and `tailwind.config.ts`; reuse `src/components/ui` primitives before adding new controls. Run `pnpm lint` before submitting changes.

## Testing Guidelines

Vitest runs in jsdom with Testing Library matchers configured by `src/test/setup.ts`. Name tests `*.test.ts(x)` or `*.spec.ts(x)` anywhere under `src`. Add focused tests for new behavior, especially routing, interactions, and conditional rendering. No coverage threshold is configured, so prioritize meaningful assertions over snapshots or coverage-only tests.

## Commit & Pull Request Guidelines

Recent history uses short imperative summaries, sometimes with Conventional Commit prefixes such as `fix:` and `ci:`. Prefer `type: concise description` (for example, `fix: preserve route on page refresh`) and keep each commit focused. Pull requests should explain the user-visible change, list verification commands, link relevant issues, and include before/after screenshots for visual work. For code changes, run the appropriate checks before requesting review and report exact commands/results; never claim a test ran if it did not. The planned CI/E2E gates are in `docs/plano/04_SEGURANCA_CI_TESTES_OPERACAO.md`.
