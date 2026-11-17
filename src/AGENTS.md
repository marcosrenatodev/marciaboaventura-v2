# Instructions for `src/`

## Scope

`src/` currently implements Márcia's public marketing site. Keep it public, fast and responsive. `src/pages/Workspace.tsx`, exposed at `/escritorio`, is only a design prototype with fictitious data and in-memory interactions. It is not an authenticated app and must never receive real client, case, financial or document data. The production legal workspace belongs in a separate app/API as described in `docs/plano/03_ARQUITETURA_IA_CLOUDFLARE.md`.

## Rules

- Never place real client/process/financial/document information, tokens, OAuth secrets or provider API keys in source, props, fixtures, analytics, local storage or public assets.
- Do not simulate an official judicial query or verified signature. Label synthetic examples and demos clearly.
- Preserve the existing marsala/gold/cream visual identity when appropriate, but do not copy Astrea's interface. Use shared design tokens and accessible native-feeling patterns.
- Prefer one clear primary action, Portuguese labels understandable to a lawyer, explicit loading/empty/error/success states and responsive behavior.
- Meet WCAG 2.2 AA; make primary touch controls comfortable for mobile, keep focus visible, support keyboard/screen readers and do not rely on color alone.
- Keep marketing content within OAB advertising rules. Never publish client identity, case facts, outcomes or promises.
- Follow local project scripts from root `AGENTS.md`; tests in this folder use `src/test` and synthetic fixtures only.
