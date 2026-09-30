import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '@/lib/api'
import { SummarizeButton } from './SummarizeButton'

vi.mock('@/lib/api', () => ({ api: { post: vi.fn() } }))

const post = vi.mocked(api.post)

function renderButton() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <SummarizeButton ticketId={7} />
    </QueryClientProvider>,
  )
}

describe('SummarizeButton', () => {
  beforeEach(() => {
    post.mockReset()
  })

  it('shows only the button at first', () => {
    renderButton()
    expect(screen.getByRole('button', { name: 'Summarize' })).toBeEnabled()
    expect(screen.queryByText('Summary')).not.toBeInTheDocument()
    expect(post).not.toHaveBeenCalled()
  })

  it('is disabled while summarizing', async () => {
    post.mockReturnValue(new Promise(() => {}))
    renderButton()

    await userEvent.click(screen.getByRole('button', { name: 'Summarize' }))

    expect(await screen.findByRole('button', { name: 'Summarizing…' })).toBeDisabled()
  })

  it('shows the summary', async () => {
    post.mockResolvedValue({ data: { summary: 'Sara wants a refund.' } })
    renderButton()

    await userEvent.click(screen.getByRole('button', { name: 'Summarize' }))

    expect(await screen.findByText('Sara wants a refund.')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Summary' })).toBeInTheDocument()
    expect(post).toHaveBeenCalledWith('/tickets/7/summarize')
  })

  it('generates a new summary on every click', async () => {
    post
      .mockResolvedValueOnce({ data: { summary: 'First summary.' } })
      .mockResolvedValueOnce({ data: { summary: 'Second summary.' } })
    renderButton()

    await userEvent.click(screen.getByRole('button', { name: 'Summarize' }))
    expect(await screen.findByText('First summary.')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Summarize' }))
    expect(await screen.findByText('Second summary.')).toBeInTheDocument()
    expect(screen.queryByText('First summary.')).not.toBeInTheDocument()
    expect(post).toHaveBeenCalledTimes(2)
  })

  it('shows the server error', async () => {
    post.mockRejectedValue(
      Object.assign(new Error('fail'), {
        isAxiosError: true,
        response: { data: { error: 'AI summaries are not configured' } },
      }),
    )
    renderButton()

    await userEvent.click(screen.getByRole('button', { name: 'Summarize' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('AI summaries are not configured')
  })

  it('shows a fallback error when the server sent no text', async () => {
    post.mockRejectedValue(new Error('Network Error'))
    renderButton()

    await userEvent.click(screen.getByRole('button', { name: 'Summarize' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not summarize the ticket.')
  })
})
