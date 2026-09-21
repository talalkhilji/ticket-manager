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
- AI-drafted replies (agents review, edit and send; the AI never sends on its own)
- User management (admin only)
- Dashboard to view and manage all tickets

## Ticket Statuses

Each ticket has exactly one status:

- **Open** - the ticket has been received and is not yet resolved
- **Resolved** - set by an agent or admin. If the student replies later, the ticket reopens.
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

- Knowledge base. To be assessed later. For now the AI drafts generic replies from the ticket alone, so drafts must not invent policies, prices or refund promises.
- Automatic sending of AI replies.