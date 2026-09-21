# Ticket Manager

AI-powered support ticket system. It receives support emails, creates tickets, classifies them, summarizes them, and drafts replies that agents review and send. The AI never sends replies on its own.

Read these before making product decisions:

- @project-scope.md - problem, features, statuses, categories, roles, out of scope
- @tech-stack.md - chosen stack
- @implementation-plan.md - phased task list (tick items off as they are done)

## Structure

npm workspaces monorepo:

- `client/` - React 19 + Vite + TypeScript (linted with oxlint)
- `server/` - Express 5 + TypeScript (run with tsx, built with tsc)

Planned (see tech-stack.md): Tailwind, React Router, PostgreSQL, Prisma, Zod, pg-boss, SendGrid, Anthropic SDK, Vitest, Playwright.

## Commands

Run from the repo root:

- `npm run dev` - start server and client together
- `npm run build` - build server, then client
- `npm run typecheck` - typecheck the server
- `npm run lint -w client` - lint the client

## Conventions

- TypeScript everywhere, ESM (`"type": "module"`).
- Validate all external input (requests, env vars, webhooks) with Zod.
- Ticket status: `open`, `resolved`, `closed`. Category: general, technical, refund, other. Exactly one of each per ticket.
- Closed tickets are final: a student reply must not reopen them or create a new ticket.
- AI-drafted replies must not invent policies, prices or refund promises (there is no knowledge base yet).
- Roles: `admin` (one pre-created, manages users) and `agent`. Agents cannot take or reassign a ticket another agent holds.
- Never commit secrets. Use `.env` (with a committed `.env.example`).

## Documentation lookup (Context7)

The Context7 MCP server is configured in `.mcp.json`. Use it to get up-to-date docs instead of relying on memory.

- Use Context7 whenever working with a library, framework, SDK or CLI: React, Vite, Express, Prisma, Tailwind, React Router, Zod, pg-boss, SendGrid, Vitest, Playwright, the Anthropic SDK, etc.
- Call `resolve-library-id` first, then `query-docs` with the resolved ID.
- Do this for setup, configuration, API syntax, version migrations and library-specific debugging, even for well-known libraries. Versions here are recent (React 19, Express 5, Vite 8, TypeScript 6/7), so training data may be out of date.
- Do not use it for business logic, refactoring or general programming questions.
