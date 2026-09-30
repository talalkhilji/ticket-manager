# Ticket Manager

AI-powered support ticket system. It receives support emails, creates tickets, classifies them, summarizes them, and drafts replies that agents review and send. The AI never sends replies on its own.

Read these before making product decisions:

- @project-scope.md - problem, features, statuses, categories, roles, out of scope
- @tech-stack.md - chosen stack
- @implementation-plan.md - phased task list (tick items off as they are done)

## Structure

npm workspaces monorepo:

- `core/` - shared package (`core`): Zod schemas and inferred types used by both client and server. Compiled with tsc to `core/dist`.
- `client/` - React 19 + Vite + TypeScript (linted with oxlint), Tailwind v4, shadcn/ui, React Router, react-hook-form + Zod
- `server/` - Express 5 + TypeScript (run with tsx, built with tsc), PostgreSQL via Prisma, better-auth

pg-boss (pinned to 10.4.2 because 11+ needs Node 22; the queue and worker live in `server/src/queue.ts`) is in use. Planned (see tech-stack.md): SendGrid, Anthropic SDK, Vitest. Playwright is set up (see Testing below).

## Commands

Run from the repo root:

- `npm run dev` - start server and client together
- `npm run build` - build server, then client
- `npm run typecheck` - typecheck the server
- `npm run lint -w client` - lint the client
- `npm test -w client` - run client component tests (Vitest + React Testing Library)
- `npm run test:watch -w client` - rerun component tests on every change while writing them
- `npm run seed -w server` - create the initial admin (needs `ADMIN_EMAIL` and `ADMIN_PASSWORD` in `server/.env`)
- `npm run seed:tickets -w server` - (re)create 100 varied sample tickets for development; safe to re-run

## Testing

Write and fix all Playwright end-to-end tests with the `e2e-test-writer` agent (`.claude/agents/e2e-test-writer.md`). Do not write or edit specs under `e2e/` directly. The agent holds the test stack details, conventions and safety rules.

- Use it when a feature is finished or its behaviour changes, and when an e2e test fails or is flaky.
- Give it the feature, the routes or endpoints involved, which roles can do what, and the rules from this file that apply (for example closed tickets are final, agents cannot take another agent's ticket). Tell it what is built so it does not test planned features.
- It only writes tests. It does not change app code and does not commit. When it reports app issues (a real bug, a missing accessible name, a permission gap), fix them in the app, then have it rerun the tests.
- Ask for a run of the whole suite before calling a feature done, and tick the matching item in `implementation-plan.md` only after it passes.

### Component tests (client)

Component tests use Vitest, jsdom and React Testing Library. They are separate from the Playwright e2e tests above, which still go through the `e2e-test-writer` agent.

- Write them when you build or change a client component or page. Put the file next to the component as `Name.test.tsx`.
- Run them with `npm test -w client` (all, once). Use `npm run test:watch -w client` while writing. Run the whole set before calling client work done, and fix failures rather than skipping or deleting tests.
- Query the way a user sees the page: `getByRole`, `getByLabelText`, `getByText`. Avoid test ids and class names. If something has no accessible name, fix the component.
- Use `userEvent` (not `fireEvent`) for interaction, and `findBy*` or `waitFor` for async results.
- Mock the network by mocking `@/lib/api` (`vi.mock`), not `fetch` or axios internals. Mock `../components/NavBar` (or `authClient`) when the test is not about the nav or session.
- Render with a fresh `QueryClient` per test with `retry: false`, wrapped in `QueryClientProvider` (and `MemoryRouter` if the component uses routing).
- Cover loading, success, empty, error and the main interactions. Keep tests independent: reset mocks in `beforeEach`.
- Setup lives in `client/src/test/setup.ts` (jest-dom matchers and cleanup). Config is the `test` block in `client/vite.config.ts`.
- Context7 applies to Vitest and Testing Library APIs like any other library.

## Conventions

- TypeScript everywhere, ESM (`"type": "module"`).
- Validate all external input (requests, env vars, webhooks) with Zod.
- Define every Zod schema that describes data shared between client and server (request bodies, form inputs, DTOs) once in `core/src` and export it (and its `z.infer` type) from `core/src/index.ts`. Import it from `'core'` in both the server (request validation) and the client (react-hook-form `zodResolver`). Never duplicate a shared schema in `client/` or `server/`. Put user-facing error messages in the schema. Schemas only used on one side (server env vars, server query parsing) stay local. `core` is compiled, so rebuild it after editing (`npm run build -w core`; `npm run dev` watches it, and `npm install` builds it).
- Ticket status: `open`, `resolved`, `closed`. Category: general, technical, refund, other. Exactly one of each per ticket.
- Closed tickets are final: a student reply must not reopen them or create a new ticket.
- AI-drafted replies must not invent policies, prices or refund promises (there is no knowledge base yet).
- Roles: `admin` (one pre-created, manages users) and `agent`. Agents cannot take or reassign a ticket another agent holds.
- Never commit secrets. Use `.env` (with a committed `.env.example`).

### Auth and roles

- Auth is better-auth (`server/src/auth.ts`) with the `admin` plugin: email and password, sign-up disabled, default role `agent`. This replaces the hand-rolled session plan in `tech-stack.md`.
- Accounts are created server-side with `auth.api.createUser` (see `server/prisma/seed.ts`), never through public sign-up.
- The client reads the role from `authClient.useSession()` (`data.user.role`); `authClient` includes `adminClient()`.
- Admin-only pages use `<ProtectedRoute adminOnly>`; the nav shows the Users link to admins only. This is a UI convenience only. Every admin endpoint must also check the role on the server.
- Routes so far: `/login`, `/` (home), `/tickets` (any signed-in user: ticket list, paged, sorted on the server (default newest first) via `sortBy`/`sortOrder` query params from `ticketSortFields` in `core`; filtered by `status`, `category` (or `none`), `assignee` (`me` or `unassigned`) and `search`, all on the server; page, page size (10 by default, or 20, 50, 100; shared `Pagination` component), sort and filters live in the URL query string; the client uses TanStack Table v9 with `manualSorting`; `GET /api/tickets` with `requireAuth`), `/users` (admin only: user list with search and paging, plus "Create user" and per-row edit (pencil icon) modals).
- Creating a user: `POST /api/users` (admin only) validates the body with `createUserSchema` from `core` (name min 3, email, password min 8) and calls `auth.api.createUser`; the role is always `agent`.
- Editing a user: `PATCH /api/users/:id` (admin only) validates with `updateUserSchema` from `core` (same rules, but the password is optional). It updates name and email with `auth.api.adminUpdateUser` and only calls `auth.api.setUserPassword` when a non-empty password is sent; a blank password leaves the current one unchanged. Role and ban state cannot be changed here. Both calls need the admin's session, so pass `fromNodeHeaders(req.headers)`.
- Deleting a user: `DELETE /api/users/:id` (admin only) is a soft delete. It sets `deletedAt`, moves the email to `deletedEmail` and replaces `email` with `deleted+<id>@deleted.invalid` (so the address can be reused), bans the user and deletes their sessions; the row stays. Admin accounts cannot be deleted (403, enforced on the server; the UI hides the button). Unknown or already deleted ids return 404. Every query that reads users must filter `deletedAt: null`. The client confirms in `DeleteUserDialog.tsx`.
- Password minimum is 8 everywhere (`minPasswordLength` in `server/src/auth.ts`, the `core` schemas). Keep them in sync.
- The client form is `client/src/components/UserForm.tsx` (create when no `user` prop, edit when given one), shown in `UserDialog.tsx`. It uses react-hook-form + the `core` schemas (`zodResolver`), the same pattern as `LoginPage.tsx`. Use react-hook-form + Zod for every client form.
- A dev agent account `agent@example.com` exists in the local database (password is not recorded here).

### Replying to tickets

- `POST /api/tickets/:id/messages` (`requireAuth`) validates `createReplySchema` from `core` and stores an outbound `Message` from the caller's email. It is stored only: nothing is emailed yet (SendGrid is Phase 5).
- Closed tickets return 409. An agent may reply on an unassigned ticket (which assigns it to them) or their own; another agent's ticket returns 403. Admins can reply on any non-closed ticket. Replying does not change status.
- Every `Message` has a `senderType` (`agent` or `customer`, `messageSenderTypes` in `core`) next to `direction`: the reply route sets `agent`, `createTicketFromEmail` sets `customer`. The thread shows it as a badge. A `system` value is planned for the closed-ticket template reply.
- The client form is `client/src/components/ReplyForm.tsx`, shown under the thread on `TicketDetailPage.tsx` (replaced by a notice when the ticket is closed).
- Polish: the "Polish" button (before "Send reply") calls `POST /api/tickets/:id/polish` (`requireAuth`, body validated with `polishReplySchema` from `core`, same access rules as replying, 409 on closed). It rewrites the agent's draft with `gpt-5-nano` through the Vercel AI SDK (`ai` + `@ai-sdk/openai`, `server/src/services/polish.ts`) and returns `{ body }`, which the client puts back in the reply box. Nothing is stored or sent. It needs `OPENAI_API_KEY` in `server/.env` (503 when unset). The prompt forbids adding policies, prices or refund promises. Polish, Summarize and auto-classification (see Inbound email) are the only OpenAI uses; other planned AI features use the Anthropic SDK.
- Summarize: the "Summarize" button (sparkles icon, `SummarizeButton.tsx`) sits below the thread on `TicketDetailPage.tsx` and calls `POST /api/tickets/:id/summarize` (`requireAuth`, no body). It summarizes the subject and the whole conversation with `gpt-5-nano` (`server/src/services/summarize.ts`, same setup and `OPENAI_API_KEY` as Polish) and returns `{ summary }` (`ticketSummarySchema` in `core`). It is regenerated on every click and never stored. It is read-only, so any signed-in user can summarize any ticket, including closed ones and other agents' tickets. 404 for an unknown ticket, 502 when the AI call fails, 503 when the key is unset.

### Inbound email (simulated)

- There is no SendGrid integration yet. `POST /api/inbound/email` (`server/src/routes/inbound.ts`) simulates an email arriving at the support address. It is only mounted when `INBOUND_SECRET` (min 32 chars) is set, and every call needs the `x-inbound-secret` header (401 otherwise).
- The body is validated with `inboundEmailSchema` from `core` (`from`, required `fromName`, `subject`, `body`, optional `messageId`, `inReplyTo`). 201 = ticket created, 200 = duplicate `messageId` (existing ticket returned), 400 = invalid body.
- Ticket creation lives in `createTicketFromEmail` (`server/src/services/tickets.ts`): a new ticket is `open` with no category (category is optional and unset until classified), with the email as its first inbound `Message`. A real SendGrid webhook should map its payload onto `InboundEmail` and call the same function.
- Auto-classification: after a 201 (not for duplicates), the route calls `void enqueueClassifyTicket(ticket.id)` (`server/src/queue.ts`) once the response is sent, which adds a job to the pg-boss queue `classify-ticket` (policy `short` plus `singletonKey` = ticket id, so a ticket is queued once). The worker runs inside the server process, started from `index.ts` (`startQueue`, stopped on SIGINT/SIGTERM), and calls `classifyTicketJob` (`server/src/services/tickets.ts`), which classifies with `gpt-5-nano` (`server/src/services/classify.ts`, structured output validated with Zod, same `OPENAI_API_KEY`) and only writes while the category is still null, so an agent's manual choice is never overwritten. Jobs retry 3 times with backoff; after that the ticket stays uncategorised. With no key nothing is queued or worked. If the queue cannot start, the API still runs. pg-boss keeps its tables in its own `pgboss` schema in the same database (created on start, no Prisma migration). Any new way of creating tickets should call `enqueueClassifyTicket` too.
- Not built yet: reply threading, reopening resolved tickets, the closed-ticket template reply, auto-reply/bounce filtering, outbound email.

### Client data fetching

- Use axios for all HTTP calls to our API, through the shared instance in `client/src/lib/api.ts` (`baseURL: '/api'`). Do not use `fetch`.
- Use TanStack Query (`@tanstack/react-query`) for server state: `useQuery` for reads, `useMutation` for writes. Do not hand-roll loading, error or result state with `useEffect` and `useState`.
- Pass the query's `signal` to axios so stale requests are cancelled, and invalidate related query keys after a mutation.
- Auth calls go through `authClient` (better-auth), not axios.

### Client UI

- Style only with Tailwind utility classes. No custom CSS: `client/src/index.css` holds just the Tailwind import and the shadcn theme variables (generated by the CLI).
- Use shadcn/ui components from `@/components/ui` (default `base-nova` preset, neutral). Add more with `npx shadcn@latest add <name>` from `client/`.
- Use theme tokens (`bg-background`, `text-muted-foreground`, `text-destructive`, ...), not hard-coded colours like `gray-500`.
- Import with the `@/` alias (maps to `client/src`).
- Dark mode is class-based (`.dark`), not OS-based, and there is no toggle yet.
- Chrome autofill styling is suppressed in the shared `Input` (`autofill:` class). Keep it when editing `input.tsx`.

## Documentation lookup (Context7)

The Context7 MCP server is configured in `.mcp.json`. Use it to get up-to-date docs instead of relying on memory.

- Use Context7 whenever working with a library, framework, SDK or CLI: React, Vite, Express, Prisma, Tailwind, React Router, Zod, pg-boss, SendGrid, Vitest, Playwright, the Anthropic SDK, etc.
- Call `resolve-library-id` first, then `query-docs` with the resolved ID.
- Do this for setup, configuration, API syntax, version migrations and library-specific debugging, even for well-known libraries. Versions here are recent (React 19, Express 5, Vite 8, TypeScript 6/7), so training data may be out of date.
- Do not use it for business logic, refactoring or general programming questions.
