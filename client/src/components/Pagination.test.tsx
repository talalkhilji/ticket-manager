import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { Pagination } from './Pagination'

function renderPagination(props: Partial<Parameters<typeof Pagination>[0]> = {}) {
  const onPageChange = vi.fn()
  const onPageSizeChange = vi.fn()
  render(
    <Pagination
      page={1}
      totalPages={1}
      total={0}
      pageSize={20}
      pageSizeOptions={[10, 20, 50]}
      noun={['ticket', 'tickets']}
      onPageChange={onPageChange}
      onPageSizeChange={onPageSizeChange}
      {...props}
    />,
  )
  return { onPageChange, onPageSizeChange }
}

const pageButtons = () =>
  screen.getAllByRole('button', { name: /^Page \d+$/ }).map((b) => b.textContent)

describe('Pagination', () => {
  it('summarises the total, the page and the visible range', () => {
    renderPagination({ page: 2, totalPages: 6, total: 102 })

    expect(screen.getByText('102 tickets · Page 2 of 6')).toBeInTheDocument()
    expect(screen.getByText('(showing 21–40)')).toBeInTheDocument()
  })

  it('caps the range at the total on the last page', () => {
    renderPagination({ page: 6, totalPages: 6, total: 102 })
    expect(screen.getByText('(showing 101–102)')).toBeInTheDocument()
  })

  it('uses the singular for one item', () => {
    renderPagination({ total: 1 })
    expect(screen.getByText('1 ticket · Page 1 of 1')).toBeInTheDocument()
  })

  it('shows no range when there is nothing to list', () => {
    renderPagination({ total: 0 })
    expect(screen.queryByText(/showing/)).not.toBeInTheDocument()
  })

  it('shows every page when there are few, and marks the current one', () => {
    renderPagination({ page: 2, totalPages: 3, total: 50 })

    expect(pageButtons()).toEqual(['1', '2', '3'])
    expect(screen.getByRole('button', { name: 'Page 2' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('button', { name: 'Page 1' })).not.toHaveAttribute('aria-current')
  })

  it('collapses distant pages into gaps around the current page', () => {
    renderPagination({ page: 10, totalPages: 20, total: 400 })
    expect(pageButtons()).toEqual(['1', '9', '10', '11', '20'])
    expect(screen.getAllByText('…')).toHaveLength(2)
  })

  it('has no gap next to the first page', () => {
    renderPagination({ page: 2, totalPages: 20, total: 400 })
    expect(pageButtons()).toEqual(['1', '2', '3', '20'])
    expect(screen.getAllByText('…')).toHaveLength(1)
  })

  it('disables Previous on the first page', () => {
    renderPagination({ page: 1, totalPages: 3, total: 50 })
    expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Next' })).toBeEnabled()
  })

  it('disables Next on the last page', () => {
    renderPagination({ page: 3, totalPages: 3, total: 50 })
    expect(screen.getByRole('button', { name: 'Previous' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled()
  })

  it('reports page changes from Previous, Next and the page numbers', async () => {
    const user = userEvent.setup()
    const { onPageChange } = renderPagination({ page: 2, totalPages: 5, total: 100 })

    await user.click(screen.getByRole('button', { name: 'Next' }))
    await user.click(screen.getByRole('button', { name: 'Previous' }))
    await user.click(screen.getByRole('button', { name: 'Page 5' }))

    expect(onPageChange.mock.calls).toEqual([[3], [1], [5]])
  })

  it('reports a new page size as a number', async () => {
    const user = userEvent.setup()
    const { onPageSizeChange } = renderPagination({ total: 100, totalPages: 5 })

    expect(screen.getByRole('combobox', { name: 'Rows per page' })).toHaveValue('20')
    await user.selectOptions(screen.getByRole('combobox', { name: 'Rows per page' }), '50')

    expect(onPageSizeChange).toHaveBeenCalledWith(50)
  })
})
