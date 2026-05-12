# Contributing to d365-webresource-base

## Fork / PR Workflow

1. Fork the repo and create a feature branch from `main`.
2. Make your changes. Keep commits small and focused.
3. Open a pull request against `main`. Describe what the change does and why.
4. All unit tests must pass before a PR can be merged (`npm run test:unit`).

## Conventional Commits

Use these prefixes in your commit messages:

| Prefix | Use for |
|--------|---------|
| `feat:` | New helper, new form example, new test file |
| `fix:` | Bug fix in an existing helper |
| `docs:` | README, BEST_PRACTICES, PATTERNS, CONTRIBUTING changes |
| `test:` | Adding or updating test coverage only |
| `chore:` | Dependency bumps, config changes, tooling |

Example: `feat: add Ops.Form.setSectionVisible helper`

## Testing

**Unit tests are required for all `src/` changes.**

- Tests live in `test/unit/`. One file per module (e.g., `ops.form.test.js`).
- Run with `npm run test:unit`.
- Use `xrm-mock-generator` to bootstrap `Xrm` and `formContext` — do not mock Xrm manually.
- Tests must cover the happy path and the null/missing-attribute guard path.
- Coverage flag: `npm run test:unit -- --coverage`. Currently reports 0% — source files are loaded via `new Function` in `jest.setup.js`, which V8 cannot instrument. Fix is tracked but not yet implemented.

**Playwright E2E tests are optional** for form examples in `src/forms/`. They require a live D365 org and credentials in `playwright/test.env.json` (not committed).

## Adding a New Form Example

1. Create `src/forms/<entity>.form.js` following the pattern in `src/forms/opportunity.form.js`.
2. Register event handlers (`onLoad`, `onSave`, `onChange`) — no IIFE-level `Ops.*` aliases.
3. Use `Ops.Form.addOnChange` (not raw `addOnChange`) for all `onChange` registrations.
4. Add the new file to the module map table in `README.md`.
5. Add unit tests in `test/unit/ops.forms.<entity>.test.js`.
6. Optionally add a Playwright E2E test in `playwright/tests/<entity>.form.test.js`.
