import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AxiosError } from 'axios'
import { useState } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '@/lib/api'
import { CreateUserDialog } from './CreateUserDialog'

vi.mock('@/lib/api', () => ({ api: { post: vi.fn() } }))

const post = vi.mocked(api.post)

function Harness() {
  const [open, setOpen] = useState(true)
  return (
    <>
      <button onClick={() => setOpen(true)}>Reopen</button>
      <CreateUserDialog open={open} onOpenChange={setOpen} />
    </>
  )
}

function renderDialog() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const invalidate = vi.spyOn(client, 'invalidateQueries')
  render(
    <QueryClientProvider client={client}>
      <Harness />
    </QueryClientProvider>,
  )
  return { invalidate }
}

async function fill(user: ReturnType<typeof userEvent.setup>, name: string, email: string, pw: string) {
  if (name) await user.type(screen.getByLabelText('Name'), name)
  if (email) await user.type(screen.getByLabelText('Email'), email)
  if (pw) await user.type(screen.getByLabelText('Password'), pw)
  await user.click(screen.getByRole('button', { name: 'Create user' }))
}

describe('CreateUserDialog', () => {
  beforeEach(() => {
    post.mockReset()
  })

  it('shows validation errors and does not submit an invalid form', async () => {
    const user = userEvent.setup()
    renderDialog()

    await fill(user, 'Al', 'not-an-email', 'short')

    expect(await screen.findByText('Name must be at least 3 characters')).toBeInTheDocument()
    expect(screen.getByText('Enter a valid email address')).toBeInTheDocument()
    expect(screen.getByText('Password must be at least 8 characters')).toBeInTheDocument()
    expect(post).not.toHaveBeenCalled()
  })

  it('creates the user, refreshes the list and closes the modal', async () => {
    const user = userEvent.setup()
    post.mockResolvedValue({ data: {} })
    const { invalidate } = renderDialog()

    await fill(user, 'Dana Agent', 'dana@example.com', 'password123')

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(post).toHaveBeenCalledWith('/users', {
      name: 'Dana Agent',
      email: 'dana@example.com',
      password: 'password123',
    })
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['users'] })
  })

  it('shows the server error and keeps the modal open', async () => {
    const user = userEvent.setup()
    post.mockRejectedValue(
      new AxiosError('conflict', '409', undefined, undefined, {
        status: 409,
        data: { error: 'A user with this email already exists' },
      } as never),
    )
    renderDialog()

    await fill(user, 'Dana Agent', 'dana@example.com', 'password123')

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'A user with this email already exists',
    )
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('clears the form when closed and reopened', async () => {
    const user = userEvent.setup()
    renderDialog()

    await user.type(screen.getByLabelText('Name'), 'Dana')
    await user.click(screen.getByRole('button', { name: 'Close' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: 'Reopen' }))

    expect(await screen.findByLabelText('Name')).toHaveValue('')
  })
})
