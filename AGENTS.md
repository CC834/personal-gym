# Personal Gym Engineering Guide

Read `README.md`, `package.json`, and the relevant tests before editing. This is a small Node.js 24 ESM application using `node:http`, `node:sqlite`, vanilla HTML/CSS/JavaScript, and `node:test`. Do not introduce a framework, build tool, or dependency without a concrete need and explicit approval.

## Product boundaries

- Preserve private, local-first workout history, kilogram-based logging, session snapshots, progression confirmation, the `/gym` mount path, and missing-media fallbacks.
- Preserve Tailscale identity checks, CSRF/session protections, loopback-only deployment, restrictive file permissions, and security headers. Never commit or log runtime configuration, secrets, personal workout data, or authentication values.
- Exercise metadata may be imported from the configured upstream revision. Never download or bundle exercise images/GIFs automatically; media must come from an explicitly supplied licensed directory and retain its attribution.

## Structure and code

- Prefer simple, explicit code that matches existing names, error handling, API shapes, and interface language. Avoid drive-by refactors, speculative abstractions, and unnecessary dependencies.
- Keep HTTP parsing and response handling in `src/server.mjs`, workout and progression rules in `src/workouts.mjs`, SQLite statements and transactions in `src/store.mjs`, authentication in `src/auth.mjs`, and catalog/media validation in `src/catalog.mjs`.
- Keep browser event handlers thin and rendering in `public/render.js`. Preserve semantic HTML, keyboard access, visible focus, responsive layouts, useful empty/error states, and reduced-motion support.
- Avoid both giant mixed-responsibility files and mechanical fragmentation. Create a module only when it improves a real responsibility boundary, readability, testability, reuse, or maintainability. Do not add one-use interfaces, factories, wrappers, or vague `Manager`, `Helper`, or `BaseService` classes.
- Validate untrusted input, parameterize SQL, use transactions for multi-step persistence, and keep entry points small. Treat deployed schema changes as append-only and preserve existing data.

## Verification

- Add or update focused tests for changed behavior, including validation and important failure cases.
- Run `npm run check` and `npm test` before finishing. Server tests bind `127.0.0.1`.
- Review the final changes for secrets, generated data/media, unrelated formatting, missing error handling, and accidental changes to runtime state.
