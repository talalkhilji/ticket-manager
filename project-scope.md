# AI-Powered Ticket Management System
## Problem

We receive hundreds of support emails daily. Our agents manually read, classify, and respon to each ticket - which is slow and leads to impersonal, canned responses.

## Solution

Build a ticket management system that uses AI to automatically classify, respond to, and route support tickets - delivering faster, more personalized responses to students while freeing up agents for complex issues

## Features

- Receive support emails and create tickets
- Ticket list with filtering and sorting
- Ticket detail view
- Agents can pick a ticket and assign it to themselves
- AI-powered ticket classification
- AI summaries
- AI-drafted replies (agents review, edit and send)
- Auto-resolve: new tickets that the knowledge base clearly answers are answered and resolved by the AI; anything else is left open for agents
- User management (admin only)
- Dashboard to view and manage all tickets

## Ticket Statuses

Each ticket has exactly one status:

- **New** - just received. Set by the system; waiting for the AI to try the knowledge base. Not shown in the ticket list.
- **Processing** - the AI is trying to resolve it from the knowledge base. Set by the system; not shown in the ticket list. It ends as Resolved, or as Open when the AI cannot or must not answer.
- **Open** - the ticket has been received and is not yet resolved
- **Resolved** - set by an agent or admin, or by the AI when the knowledge base answered it. If the student replies later, the ticket reopens.
- **Closed** - set by an admin. Final: a student reply cannot reopen it. The system sends a fixed "this ticket is closed" reply (a template, not AI-generated) and creates no new ticket.

## Ticket Categories

Each ticket belongs to exactly one category:

- General question
- Technical question
- Refund request
- Others

## Users and Roles

- The system is deployed with a single pre-created admin account.
- The admin can create additional agent accounts.
- User management is admin only.
- Agents can pick an unassigned ticket and assign it to themselves as needed.
- Agents can see all tickets, including those assigned to others.
- An agent cannot take or reassign a ticket that another agent holds.

## Out of Scope (for now)

- Emailing the AI answer to the customer (the answer is stored on the ticket; sending waits for the email integration).
- Anything beyond the knowledge base file: the AI must not invent policies, prices or refund promises, and refund requests, legal threats, chargebacks and security concerns always go to an agent.