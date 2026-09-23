# Implementation Plan

Each phase ends with something that works and can be checked. Tasks are small enough to finish in one sitting.

## Phase 1: Project Setup

- [ ] Create monorepo layout with `client/` (React + Vite) and `server/` (Express) folders
- [ ] Set up TypeScript, ESLint and Prettier in both
- [ ] Add Tailwind and React Router to the client
- [ ] Add Express server with a `/api/health` endpoint
- [ ] Add PostgreSQL through Docker Compose
- [ ] Add Prisma and connect it to the database
- [ ] Add environment variable handling (`.env.example`, validated with Zod)
- [ ] Set up Vitest for the server and client

**Done when:** client and server both run locally, and the client can call `/api/health`.

## Phase 2: Database and Authentication

- [ ] Prisma schema: `User` (role: admin or agent)
- [ ] Prisma schema: `Ticket` (status: open, resolved, closed; category: general, technical, refund, other; assignee: optional agent)
- [ ] Prisma schema: `Message` (belongs to a ticket; inbound or outbound)
- [ ] Prisma schema: `Session` (random session ID, belongs to a user, expiry date)
- [ ] Run the first migration
- [ ] Seed script that creates the initial admin
- [ ] Password hashing (argon2)
- [ ] Login endpoint: verify password, create a `Session` row, set the session ID in an httpOnly cookie
- [ ] Logout endpoint: delete the `Session` row and clear the cookie
- [ ] Session lookup middleware: load the session and user from the database on each request, reject expired sessions
- [ ] Role check middleware (admin only)
- [ ] Cleanup of expired sessions (scheduled job or on login)
- [ ] Delete a user's sessions when their account is removed or their password changes
- [ ] Login page in the client
- [ ] Protected routes and a logged-in user context in the client

**Done when:** the seeded admin can log in and out (the session row is created and deleted in the database), and protected pages redirect to login.

## Phase 3: User Management (admin only)

- [ ] API: list users
- [ ] API: create agent (name, email, temporary password)
- [ ] API: deactivate or delete a user
- [ ] Users page in the client (admin only), with a list and a create form
- [ ] Tests for role restrictions (agents can't reach these endpoints)

**Done when:** an admin can create an agent, and that agent can log in but can't see the Users page.

## Phase 4: Tickets Core (manual, no email or AI yet)

- [ ] API: create ticket (used for testing and by the email step later)
- [ ] API: list tickets with filtering (status, category) and sorting (date)
- [ ] API: get ticket with its messages
- [ ] API: update ticket status (resolved: agents and admins; closed: admin only)
- [ ] API: assign an unassigned ticket to yourself (agents); reject if another agent holds it; unassign your own
- [ ] Ticket list page with filters (including assignee and "unassigned") and sorting through URL query parameters
- [ ] Ticket detail page showing the message thread
- [ ] Status change control on the detail page (close shown to admins only)
- [ ] "Assign to me" button on the detail page and list
- [ ] Pagination on the list
- [ ] Seed script with sample tickets for development

**Done when:** an agent can browse, filter, sort and open tickets, and change their status.

## Phase 5: Email In and Out (SendGrid)

- [ ] Set up SendGrid domain, sender authentication and Inbound Parse (MX record)
- [ ] Inbound webhook endpoint (parse multipart form with `multer`)
- [ ] Verify or secure the webhook (secret in the URL or another check)
- [ ] Create a ticket from an inbound email (sender, subject, body)
- [ ] Match replies to existing tickets using email headers, and add them as messages
- [ ] Reply to a resolved ticket reopens it
- [ ] Reply to a closed ticket does not reopen it and creates no new ticket
- [ ] Send a fixed "this ticket is closed" template reply to the sender (not AI), and store it on the ticket as a system message
- [ ] Limit these replies (once per sender per ticket, never to auto-replies or bounces) to avoid loops
- [ ] Ignore or flag auto-replies and bounces to avoid loops
- [ ] Send outbound reply through SendGrid with correct threading headers
- [ ] Reply box on the ticket detail page
- [ ] Store outbound messages on the ticket
- [ ] Test with real emails end to end

**Done when:** an email sent to the support address appears as a ticket, and an agent's reply arrives in the sender's inbox in the same thread.

## Phase 6: Background Jobs and AI Foundation

- [ ] Add pg-boss and a worker process
- [ ] Queue a job when a ticket is created
- [ ] Add Anthropic SDK and a small wrapper module (model, retries, errors)
- [ ] Store AI results on the ticket (category, summary, suggested reply, timestamps)
- [ ] Handle failures: a ticket must still appear if AI fails
- [ ] Log AI calls (tokens and cost, latency)

**Done when:** creating a ticket triggers a background job that runs and can fail safely.

## Phase 7: AI Features

- [ ] AI classification into the four categories (structured output with Zod validation)
- [ ] Show and allow agents to correct the category in the UI
- [ ] AI summary shown at the top of the ticket detail page
- [ ] AI-drafted reply based on the ticket conversation (no knowledge base yet)
- [ ] "Use suggested reply" button that fills the reply box for the agent to edit; the AI never sends
- [ ] Guardrail: the reply prompt must not invent policies, prices or refund promises, and should leave a placeholder for facts it doesn't have
- [ ] Tests for each AI step using mocked model responses

**Done when:** a new ticket gets a category, summary and draft reply that an agent can review and send.

## Phase 8: Dashboard

- [ ] API: ticket counts by status and category, and unassigned count
- [ ] API: recent or unhandled tickets
- [ ] Dashboard page with summary counts
- [ ] Links from dashboard numbers to the filtered ticket list

**Done when:** the dashboard opens after login and shows accurate numbers.

## Phase 9: Hardening and Release

- [ ] Input validation with Zod on every endpoint
- [ ] Rate limiting on login and the webhook
- [ ] Security headers, CORS and secure session cookies
- [ ] Playwright tests for the main flows: login, view tickets, reply, create agent
- [ ] Error handling and loading states in the client
- [ ] Production Dockerfiles and Docker Compose
- [ ] Deploy and connect the real domain and SendGrid
- [ ] Backups for the database
- [ ] Write a README with setup and deployment steps

**Done when:** the system is deployed and handles a real inbound email through to a sent reply.

## Open Decisions

These affect the plan and are not yet settled in `project-scope.md`:

1. Knowledge base is deferred. Drafts stay generic until it is assessed.
