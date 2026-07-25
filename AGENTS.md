# Repository Guidelines

## Project Structure & Module Organization

This repository contains a Vite-powered React and TypeScript single-page site. Application code lives in `src/`: route-level views are in `src/pages`, site sections and shared components are in `src/components`, and shadcn/Radix primitives are in `src/components/ui`. Reusable hooks and utilities belong in `src/hooks` and `src/lib`. Keep imported images in `src/assets`; files that must retain their public URL belong in `public`. Tests and their global setup are under `src/test`. Deployment automation is defined in `.github/workflows/pages.yml`.

## Build, Test, and Development Commands

Use Node 20 or newer and pnpm 9, matching CI (the local `.tool-versions` currently selects Node 22).

- `pnpm install --frozen-lockfile` installs the exact locked dependency set.
- `pnpm dev` starts Vite with hot reload on port 3000.
- `pnpm build` creates the production bundle in `dist/`.
- `pnpm preview` serves the built bundle for a local production check.
- `pnpm lint` runs ESLint across TypeScript and React files.
- `pnpm test` runs Vitest once; `pnpm test:watch` reruns affected tests while developing.

## Coding Style & Naming Conventions

Follow the existing two-space indentation, double quotes, semicolons, and trailing commas. Use PascalCase for React component files and exports (`PracticeAreas.tsx`), `use-` prefixed kebab-case for hooks (`use-mobile.tsx`), and camelCase for variables and helpers. Prefer the `@/` alias for imports from `src`. Compose styling with Tailwind utilities and existing design tokens in `src/index.css` and `tailwind.config.ts`; reuse `src/components/ui` primitives before adding new controls. Run `pnpm lint` before submitting changes.

## Testing Guidelines

Vitest runs in jsdom with Testing Library matchers configured by `src/test/setup.ts`. Name tests `*.test.ts(x)` or `*.spec.ts(x)` anywhere under `src`. Add focused tests for new behavior, especially routing, interactions, and conditional rendering. No coverage threshold is configured, so prioritize meaningful assertions over snapshots or coverage-only tests.

## Commit & Pull Request Guidelines

Recent history uses short imperative summaries, sometimes with Conventional Commit prefixes such as `fix:` and `ci:`. Prefer `type: concise description` (for example, `fix: preserve route on page refresh`) and keep each commit focused. Pull requests should explain the user-visible change, list verification commands, link relevant issues, and include before/after screenshots for visual work. Confirm `pnpm lint`, `pnpm test`, and `pnpm build` pass before requesting review.
