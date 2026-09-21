# Tech Stack

| Layer | Choice |
|---|---|
| Language | TypeScript |
| Frontend | React + Vite, Tailwind, React Router |
| Backend | Node.js + Express |
| Database | PostgreSQL |
| ORM | Prisma |
| Auth | Email and password with sessions (admin creates agents) |
| Inbound email | SendGrid Inbound Parse (webhook) |
| Outbound email | SendGrid |
| Job queue | pg-boss (Postgres-backed) |
| AI | Claude API (Anthropic SDK) |
| Validation | Zod |
| Testing | Vitest and Playwright |
| Deployment | Docker Compose on a single VPS, or Railway/Render/Fly.io |
