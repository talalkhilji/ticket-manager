# Playwright Test Setup

End-to-end tests run against their own database, never the dev one. No tests are written yet; this covers the infrastructure and how to check it works.

## How it is wired

| Piece | Where |
|---|---|
| Config | `playwright.config.ts` (repo root) |
| Tests go in | `e2e/tests/` |
| DB reset script | `e2e/scripts/reset-db.ts` |
| Test env | `server/.env.e2e` (gitignored), template `server/.env.e2e.example` |
| Test database | `helpdesk_test` on the same local Postgres as dev (`helpdesk`) |
| Test API / client | `http://localhost:3001` / `http://localhost:5174` |

- Before each run the reset script drops, recreates, migrates (`prisma migrate deploy`) and seeds `helpdesk_test`, creating one admin from `ADMIN_EMAIL` / `ADMIN_PASSWORD` in `.env.e2e`.
- The script refuses to run unless the database name ends in `_test`, and refuses if it is the same database as `server/.env`.
- Playwright starts its own API and client on the ports above and never reuses running servers, so it can run next to `npm run dev`.
- With `NODE_ENV=test`, sign-in rate limiting is off (it is 5 per minute otherwise).
- The Vite proxy target comes from `API_PROXY_TARGET` (default `http://localhost:3000`).
- Tests run serially in one worker because they share one database.

## First-time setup

```bash
npm install
npx playwright install chromium
cp server/.env.e2e.example server/.env.e2e   # then put your Postgres password in DATABASE_URL
```

## Commands (from the repo root)

- `npm run test:e2e` - run all tests
- `npm run test:e2e:ui` - UI mode
- `npm run e2e:db:reset` - reset the test database on its own

## Checking the setup

Run these after changing the setup. `<DEV_URL>` is the `DATABASE_URL` from `server/.env` without `?schema=public`, and `<TEST_URL>` is the same with `helpdesk_test`. With `psql` on Windows, put options before the URL: `psql -c "..." "<URL>"`.

1. **Typecheck**
   ```bash
   npm run typecheck
   ```

2. **Reset creates a clean test database**
   ```bash
   npm run e2e:db:reset
   ```
   Expect "Recreated database helpdesk_test", all migrations applied, and "Seeded admin: ...". Then:
   ```bash
   psql -c "select count(*) users, count(*) filter (where role='admin') admins from \"user\"" "<TEST_URL>"
   ```
   Expect 1 user and 1 admin.

3. **The dev database is untouched**
   ```bash
   psql -c "select count(*) users, count(*) filter (where role='admin') admins from \"user\"" "<DEV_URL>"
   ```
   Compare with the numbers you had before the reset.

4. **The `_test` guard refuses other names.** Temporarily change the database name in `server/.env.e2e` to something that does not end in `_test` and does not exist (for example `helpdesk_scratch`, never the dev name), run `npm run e2e:db:reset`, and expect `Refusing to reset "helpdesk_scratch": ...`. Restore the file afterwards.

5. **The config loads**
   ```bash
   npx playwright test --list
   ```
   Expect "No tests found" until tests exist. A config error would show a different message.

6. **The test stack works end to end.** Start both servers with the env from `server/.env.e2e` loaded:
   ```bash
   npx tsx server/src/index.ts
   API_PROXY_TARGET=http://localhost:3001 npm run dev -w client -- --port 5174 --strictPort
   ```
   Then check:
   ```bash
   curl localhost:3001/api/health          # {"status":"ok"}
   curl localhost:5174/api/health          # same, through the Vite proxy
   ```
   Sign in as the test admin 8 times in a row against `localhost:5174/api/auth/sign-in/email` (header `Origin: http://localhost:5174`). All should return 200, since rate limiting is off under test. The test database should gain those sessions and the dev database none.

7. **Stop the servers** (Windows, they are found by port):
   ```powershell
   foreach ($p in 3001,5174) { Get-NetTCPConnection -LocalPort $p -State Listen | % { Stop-Process -Id $_.OwningProcess -Force } }
   ```

## Not set up yet

CI workflow, Docker Compose Postgres, browsers other than Chromium, and the tests themselves (Phase 9 of `implementation-plan.md`).
