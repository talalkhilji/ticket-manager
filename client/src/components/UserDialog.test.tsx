import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '@/lib/api'
import { UserDialog } from './UserDialog'

vi.mock('@/lib/api', () => ({ api: { post: vi.fn(), patch: vi.fn() } }))

const post = vi.mocked(api.post)
const patch = vi.mocked(api.patch)

const existing = { id: 'u1', name: 'Bob Agent', email: 'bob@example.com' }

function Harness({ user }: { user?: typeof existing }) {
  const [open, setOpen] = useState(true)
  return (
    <>
      <button onClick={() => setOpen(true)}>Reopen</button>
      <UserDialog open={open} onOpenChange={setOpen} user={user} />
    </>
  )
}

function renderDialog(user?: typeof existing) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <Harness user={user} />
    </QueryClientProvider>,
  )
  return userEvent.setup()
}

describe('UserDialog', () => {
  beforeEach(() => {
    post.mockReset()
    patch.mockReset()
  })

  it('is a create dialog without a user', () => {
    renderDialog()

    expect(screen.getByRole('dialog', { name: 'Create user' })).toBeInTheDocument()
    expect(screen.getByLabelText('Name')).toHaveValue('')
  })

  it('is an edit dialog populated with the user', () => {
    renderDialog(existing)

    expect(screen.getByRole('dialog', { name: 'Edit user' })).toBeInTheDocument()
    expect(screen.getByLabelText('Name')).toHaveValue('Bob Agent')
    expect(screen.getByLabelText('Email')).toHaveValue('bob@example.com')
  })

  it('closes after a successful save', async () => {
    patch.mockResolvedValue({ data: {} })
    const user = renderDialog(existing)

    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('discards unsaved input when closed and reopened', async () => {
    const user = renderDialog(existing)

    await user.clear(screen.getByLabelText('Name'))
    await user.type(screen.getByLabelText('Name'), 'Changed')
    await user.click(screen.getByRole('button', { name: 'Close' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: 'Reopen' }))

    expect(await screen.findByLabelText('Name')).toHaveValue('Bob Agent')
  })
})
