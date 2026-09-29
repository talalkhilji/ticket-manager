import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AxiosError } from 'axios'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '@/lib/api'
import { CreateUserForm } from './CreateUserForm'

vi.mock('@/lib/api', () => ({ api: { post: vi.fn() } }))

const post = vi.mocked(api.post)
const onCreated = vi.fn()

function renderForm() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const invalidate = vi.spyOn(client, 'invalidateQueries')
  render(
    <QueryClientProvider client={client}>
      <CreateUserForm onCreated={onCreated} />
    </QueryClientProvider>,
  )
  return { invalidate, user: userEvent.setup() }
}

type User = ReturnType<typeof userEvent.setup>

async function fillAndSubmit(user: User, name: string, email: string, password: string) {
  if (name) await user.type(screen.getByLabelText('Name'), name)
  if (email) await user.type(screen.getByLabelText('Email'), email)
  if (password) await user.type(screen.getByLabelText('Password'), password)
  await user.click(screen.getByRole('button', { name: 'Create user' }))
}

function axiosError(status: number, data: unknown) {
  return new AxiosError('failed', String(status), undefined, undefined, {
    status,
    data,
  } as never)
}

describe('CreateUserForm', () => {
  beforeEach(() => {
    post.mockReset()
    onCreated.mockReset()
  })

  it('renders empty name, email and password fields', () => {
    renderForm()

    expect(screen.getByLabelText('Name')).toHaveValue('')
    expect(screen.getByLabelText('Email')).toHaveValue('')
    expect(screen.getByLabelText('Password')).toHaveValue('')
    expect(screen.getByLabelText('Password')).toHaveAttribute('type', 'password')
    expect(screen.getByRole('button', { name: 'Create user' })).toBeEnabled()
  })

  it('shows an error for every empty field and does not submit', async () => {
    const { user } = renderForm()

    await user.click(screen.getByRole('button', { name: 'Create user' }))

    expect(await screen.findByText('Name must be at least 3 characters')).toBeInTheDocument()
    expect(screen.getByText('Enter a valid email address')).toBeInTheDocument()
    expect(screen.getByText('Password must be at least 8 characters')).toBeInTheDocument()
    expect(screen.getByLabelText('Name')).toBeInvalid()
    expect(post).not.toHaveBeenCalled()
    expect(onCreated).not.toHaveBeenCalled()
  })

  it('rejects a name shorter than 3 characters', async () => {
    const { user } = renderForm()

    await fillAndSubmit(user, 'Al', 'al@example.com', 'password123')

    expect(await screen.findByText('Name must be at least 3 characters')).toBeInTheDocument()
    expect(post).not.toHaveBeenCalled()
  })

  it('rejects a name that is only whitespace', async () => {
    const { user } = renderForm()

    await fillAndSubmit(user, '     ', 'al@example.com', 'password123')

    expect(await screen.findByText('Name must be at least 3 characters')).toBeInTheDocument()
    expect(post).not.toHaveBeenCalled()
  })

  it('rejects an invalid email', async () => {
    const { user } = renderForm()

    await fillAndSubmit(user, 'Dana Agent', 'not-an-email', 'password123')

    expect(await screen.findByText('Enter a valid email address')).toBeInTheDocument()
    expect(post).not.toHaveBeenCalled()
  })

  it('rejects a password shorter than 8 characters, but accepts exactly 8', async () => {
    post.mockResolvedValue({ data: {} })
    const { user } = renderForm()

    await fillAndSubmit(user, 'Dana Agent', 'dana@example.com', '1234567')
    expect(await screen.findByText('Password must be at least 8 characters')).toBeInTheDocument()
    expect(post).not.toHaveBeenCalled()

    await user.type(screen.getByLabelText('Password'), '8')
    await user.click(screen.getByRole('button', { name: 'Create user' }))

    await waitFor(() => expect(post).toHaveBeenCalledTimes(1))
    expect(screen.queryByText('Password must be at least 8 characters')).not.toBeInTheDocument()
  })

  it('posts the values, refreshes the users list and calls onCreated', async () => {
    post.mockResolvedValue({ data: {} })
    const { user, invalidate } = renderForm()

    await fillAndSubmit(user, 'Dana Agent', 'dana@example.com', 'password123')

    await waitFor(() => expect(onCreated).toHaveBeenCalledTimes(1))
    expect(post).toHaveBeenCalledWith('/users', {
      name: 'Dana Agent',
      email: 'dana@example.com',
      password: 'password123',
    })
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['users'] })
  })

  it('disables the button and shows progress while the request is pending', async () => {
    post.mockReturnValue(new Promise(() => {}))
    const { user } = renderForm()

    await fillAndSubmit(user, 'Dana Agent', 'dana@example.com', 'password123')

    const button = await screen.findByRole('button', { name: 'Creating...' })
    expect(button).toBeDisabled()
    expect(onCreated).not.toHaveBeenCalled()
  })

  it('shows the message from the server, e.g. a duplicate email', async () => {
    post.mockRejectedValue(axiosError(409, { error: 'A user with this email already exists' }))
    const { user } = renderForm()

    await fillAndSubmit(user, 'Dana Agent', 'dana@example.com', 'password123')

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'A user with this email already exists',
    )
    expect(onCreated).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Create user' })).toBeEnabled()
    expect(screen.getByLabelText('Email')).toHaveValue('dana@example.com')
  })

  it('shows a generic message when the failure has no server message', async () => {
    post.mockRejectedValue(new Error('Network Error'))
    const { user } = renderForm()

    await fillAndSubmit(user, 'Dana Agent', 'dana@example.com', 'password123')

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not create the user.')
    expect(onCreated).not.toHaveBeenCalled()
  })
})
