import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AxiosError } from 'axios'
import { useState } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '@/lib/api'
import { DeleteUserDialog } from './DeleteUserDialog'

vi.mock('@/lib/api', () => ({ api: { delete: vi.fn() } }))

const del = vi.mocked(api.delete)
const target = { id: 'u1', name: 'Bob Agent', email: 'bob@example.com' }

function Harness() {
  const [open, setOpen] = useState(true)
  return <DeleteUserDialog open={open} onOpenChange={setOpen} user={target} />
}

function renderDialog() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const invalidate = vi.spyOn(client, 'invalidateQueries')
  render(
    <QueryClientProvider client={client}>
      <Harness />
    </QueryClientProvider>,
  )
  return { invalidate, user: userEvent.setup() }
}

describe('DeleteUserDialog', () => {
  beforeEach(() => {
    del.mockReset()
  })

  it('asks for confirmation naming the user', () => {
    renderDialog()

    const dialog = screen.getByRole('dialog', { name: 'Delete user' })
    expect(dialog).toHaveTextContent('Bob Agent')
    expect(dialog).toHaveTextContent('bob@example.com')
    expect(screen.getByRole('button', { name: 'Delete' })).toBeEnabled()
  })

  it('closes on Cancel without deleting', async () => {
    const { user } = renderDialog()

    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(del).not.toHaveBeenCalled()
  })

  it('deletes the user, refreshes the list and closes', async () => {
    del.mockResolvedValue({ data: undefined })
    const { user, invalidate } = renderDialog()

    await user.click(screen.getByRole('button', { name: 'Delete' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(del).toHaveBeenCalledWith('/users/u1')
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['users'] })
  })

  it('disables the button and shows progress while deleting', async () => {
    del.mockReturnValue(new Promise(() => {}))
    const { user } = renderDialog()

    await user.click(screen.getByRole('button', { name: 'Delete' }))

    expect(await screen.findByRole('button', { name: 'Deleting...' })).toBeDisabled()
  })

  it('shows the server error and stays open', async () => {
    del.mockRejectedValue(
      new AxiosError('forbidden', '403', undefined, undefined, {
        status: 403,
        data: { error: 'Admin accounts cannot be deleted' },
      } as never),
    )
    const { user } = renderDialog()

    await user.click(screen.getByRole('button', { name: 'Delete' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Admin accounts cannot be deleted')
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Delete' })).toBeEnabled()
  })

  it('shows a generic message when the failure has no server message', async () => {
    del.mockRejectedValue(new Error('Network Error'))
    const { user } = renderDialog()

    await user.click(screen.getByRole('button', { name: 'Delete' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not delete the user.')
  })
})
