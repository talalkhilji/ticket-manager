import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AxiosError } from 'axios'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '@/lib/api'
import { UserForm } from './UserForm'

vi.mock('@/lib/api', () => ({ api: { post: vi.fn(), patch: vi.fn() } }))

const post = vi.mocked(api.post)
const patch = vi.mocked(api.patch)
const onDone = vi.fn()

const existing = { id: 'u1', name: 'Bob Agent', email: 'bob@example.com' }

function renderForm(user?: typeof existing) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const invalidate = vi.spyOn(client, 'invalidateQueries')
  render(
    <QueryClientProvider client={client}>
      <UserForm user={user} onDone={onDone} />
    </QueryClientProvider>,
  )
  return { invalidate, user: userEvent.setup() }
}

type User = ReturnType<typeof userEvent.setup>

async function fillAndSubmit(user: User, name: string, email: string, password: string, button: string) {
  if (name) await user.type(screen.getByLabelText('Name'), name)
  if (email) await user.type(screen.getByLabelText('Email'), email)
  if (password) await user.type(screen.getByLabelText('Password'), password)
  await user.click(screen.getByRole('button', { name: button }))
}

function axiosError(status: number, data: unknown) {
  return new AxiosError('failed', String(status), undefined, undefined, {
    status,
    data,
  } as never)
}

beforeEach(() => {
  post.mockReset()
  patch.mockReset()
  onDone.mockReset()
})

describe('UserForm (create)', () => {
  it('renders empty name, email and password fields', () => {
    renderForm()

    expect(screen.getByLabelText('Name')).toHaveValue('')
    expect(screen.getByLabelText('Email')).toHaveValue('')
    expect(screen.getByLabelText('Password')).toHaveValue('')
    expect(screen.getByLabelText('Password')).toHaveAttribute('type', 'password')
    expect(screen.getByRole('button', { name: 'Create user' })).toBeEnabled()
    expect(screen.queryByText(/leave blank/i)).not.toBeInTheDocument()
  })

  it('shows an error for every empty field and does not submit', async () => {
    const { user } = renderForm()

    await user.click(screen.getByRole('button', { name: 'Create user' }))

    expect(await screen.findByText('Name must be at least 3 characters')).toBeInTheDocument()
    expect(screen.getByText('Enter a valid email address')).toBeInTheDocument()
    expect(screen.getByText('Password must be at least 8 characters')).toBeInTheDocument()
    expect(screen.getByLabelText('Name')).toBeInvalid()
    expect(post).not.toHaveBeenCalled()
    expect(onDone).not.toHaveBeenCalled()
  })

  it('rejects a name shorter than 3 characters', async () => {
    const { user } = renderForm()

    await fillAndSubmit(user, 'Al', 'al@example.com', 'password123', 'Create user')

    expect(await screen.findByText('Name must be at least 3 characters')).toBeInTheDocument()
    expect(post).not.toHaveBeenCalled()
  })

  it('rejects a name that is only whitespace', async () => {
    const { user } = renderForm()

    await fillAndSubmit(user, '     ', 'al@example.com', 'password123', 'Create user')

    expect(await screen.findByText('Name must be at least 3 characters')).toBeInTheDocument()
    expect(post).not.toHaveBeenCalled()
  })

  it('rejects an invalid email', async () => {
    const { user } = renderForm()

    await fillAndSubmit(user, 'Dana Agent', 'not-an-email', 'password123', 'Create user')

    expect(await screen.findByText('Enter a valid email address')).toBeInTheDocument()
    expect(post).not.toHaveBeenCalled()
  })

  it('rejects a password shorter than 8 characters, but accepts exactly 8', async () => {
    post.mockResolvedValue({ data: {} })
    const { user } = renderForm()

    await fillAndSubmit(user, 'Dana Agent', 'dana@example.com', '1234567', 'Create user')
    expect(await screen.findByText('Password must be at least 8 characters')).toBeInTheDocument()
    expect(post).not.toHaveBeenCalled()

    await user.type(screen.getByLabelText('Password'), '8')
    await user.click(screen.getByRole('button', { name: 'Create user' }))

    await waitFor(() => expect(post).toHaveBeenCalledTimes(1))
    expect(screen.queryByText('Password must be at least 8 characters')).not.toBeInTheDocument()
  })

  it('posts the values, refreshes the users list and calls onDone', async () => {
    post.mockResolvedValue({ data: {} })
    const { user, invalidate } = renderForm()

    await fillAndSubmit(user, 'Dana Agent', 'dana@example.com', 'password123', 'Create user')

    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1))
    expect(post).toHaveBeenCalledWith('/users', {
      name: 'Dana Agent',
      email: 'dana@example.com',
      password: 'password123',
    })
    expect(patch).not.toHaveBeenCalled()
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['users'] })
  })

  it('disables the button and shows progress while the request is pending', async () => {
    post.mockReturnValue(new Promise(() => {}))
    const { user } = renderForm()

    await fillAndSubmit(user, 'Dana Agent', 'dana@example.com', 'password123', 'Create user')

    expect(await screen.findByRole('button', { name: 'Creating...' })).toBeDisabled()
    expect(onDone).not.toHaveBeenCalled()
  })

  it('shows the message from the server, e.g. a duplicate email', async () => {
    post.mockRejectedValue(axiosError(409, { error: 'A user with this email already exists' }))
    const { user } = renderForm()

    await fillAndSubmit(user, 'Dana Agent', 'dana@example.com', 'password123', 'Create user')

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'A user with this email already exists',
    )
    expect(onDone).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Create user' })).toBeEnabled()
    expect(screen.getByLabelText('Email')).toHaveValue('dana@example.com')
  })

  it('shows a generic message when the failure has no server message', async () => {
    post.mockRejectedValue(new Error('Network Error'))
    const { user } = renderForm()

    await fillAndSubmit(user, 'Dana Agent', 'dana@example.com', 'password123', 'Create user')

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not create the user.')
    expect(onDone).not.toHaveBeenCalled()
  })
})

describe('UserForm (edit)', () => {
  it('is populated with the user data and an empty password', () => {
    renderForm(existing)

    expect(screen.getByLabelText('Name')).toHaveValue('Bob Agent')
    expect(screen.getByLabelText('Email')).toHaveValue('bob@example.com')
    expect(screen.getByLabelText('Password')).toHaveValue('')
    expect(screen.getByLabelText('Password')).toHaveAccessibleDescription(
      'Leave blank to keep the current password.',
    )
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeEnabled()
  })

  it('leaves the password out of the request when it is blank', async () => {
    patch.mockResolvedValue({ data: {} })
    const { user, invalidate } = renderForm(existing)

    await user.clear(screen.getByLabelText('Name'))
    await user.type(screen.getByLabelText('Name'), 'Robert Agent')
    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1))
    expect(patch).toHaveBeenCalledTimes(1)
    expect(patch).toHaveBeenCalledWith('/users/u1', {
      name: 'Robert Agent',
      email: 'bob@example.com',
    })
    expect(post).not.toHaveBeenCalled()
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['users'] })
  })

  it('sends the new password when one is provided', async () => {
    patch.mockResolvedValue({ data: {} })
    const { user } = renderForm(existing)

    await user.type(screen.getByLabelText('Password'), 'newpassword1')
    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1))
    expect(patch).toHaveBeenCalledWith('/users/u1', {
      name: 'Bob Agent',
      email: 'bob@example.com',
      password: 'newpassword1',
    })
  })

  it('rejects a provided password shorter than 8 characters', async () => {
    const { user } = renderForm(existing)

    await user.type(screen.getByLabelText('Password'), 'short')
    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    expect(await screen.findByText('Password must be at least 8 characters')).toBeInTheDocument()
    expect(patch).not.toHaveBeenCalled()
  })

  it('validates the name and email', async () => {
    const { user } = renderForm(existing)

    await user.clear(screen.getByLabelText('Name'))
    await user.type(screen.getByLabelText('Name'), 'Bo')
    await user.clear(screen.getByLabelText('Email'))
    await user.type(screen.getByLabelText('Email'), 'nope')
    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    expect(await screen.findByText('Name must be at least 3 characters')).toBeInTheDocument()
    expect(screen.getByText('Enter a valid email address')).toBeInTheDocument()
    expect(patch).not.toHaveBeenCalled()
  })

  it('shows progress while saving', async () => {
    patch.mockReturnValue(new Promise(() => {}))
    const { user } = renderForm(existing)

    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    expect(await screen.findByRole('button', { name: 'Saving...' })).toBeDisabled()
  })

  it('shows the server error and does not call onDone', async () => {
    patch.mockRejectedValue(axiosError(409, { error: 'A user with this email already exists' }))
    const { user } = renderForm(existing)

    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'A user with this email already exists',
    )
    expect(onDone).not.toHaveBeenCalled()
  })

  it('shows a generic message when saving fails without a server message', async () => {
    patch.mockRejectedValue(new Error('Network Error'))
    const { user } = renderForm(existing)

    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not save the user.')
  })
})
