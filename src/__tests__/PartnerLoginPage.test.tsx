import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import PartnerLoginPage, { loginToPortal } from '../pages/PartnerLoginPage'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function renderPage() {
  return render(
    <MemoryRouter>
      <PartnerLoginPage />
    </MemoryRouter>
  )
}

function mockFetch(ok: boolean, body: object, status = ok ? 200 : 401) {
  const spy = vi.fn().mockResolvedValue({
    ok,
    status,
    json: () => Promise.resolve(body),
  })
  vi.stubGlobal('fetch', spy)
  return spy
}

// ─── Render tests ─────────────────────────────────────────────────────────────

describe('PartnerLoginPage — render', () => {
  it('renders email and password inputs', () => {
    renderPage()
    expect(screen.getByLabelText(/email address/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument()
  })

  it('renders the sign in button', () => {
    renderPage()
    expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument()
  })

  it('renders the Register with Sliquid link', () => {
    renderPage()
    const link = screen.getByRole('link', { name: /register with sliquid/i })
    expect(link).toBeInTheDocument()
    expect(link).toHaveAttribute('href', 'https://sliquid.com/retailers/become-a-sliquid-retailer/')
    expect(link).toHaveAttribute('target', '_blank')
  })

  it('does not show an error on initial render', () => {
    renderPage()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})

// ─── Form interaction ─────────────────────────────────────────────────────────

describe('PartnerLoginPage — form interaction', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('shows error when credentials are invalid', async () => {
    mockFetch(false, { message: 'Invalid email or password.' })
    renderPage()

    await userEvent.type(screen.getByLabelText(/email/i), 'bad@example.com')
    await userEvent.type(screen.getByLabelText(/password/i), 'wrongpass')
    fireEvent.submit(screen.getByRole('button', { name: /sign in/i }))

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('Invalid email or password.')
    )
  })

  it('shows generic error when server returns no message', async () => {
    mockFetch(false, {}, 500)
    renderPage()

    await userEvent.type(screen.getByLabelText(/email/i), 'test@example.com')
    await userEvent.type(screen.getByLabelText(/password/i), 'pass')
    fireEvent.submit(screen.getByRole('button', { name: /sign in/i }))

    await waitFor(() =>
      expect(screen.getByRole('alert')).toBeInTheDocument()
    )
  })

  it('opens portal in a new tab with token in URL hash on success', async () => {
    mockFetch(true, { token: 'test-jwt-token', user: { name: 'Jane' } })
    const openSpy = vi.fn()
    vi.stubGlobal('open', openSpy)
    renderPage()

    await userEvent.type(screen.getByLabelText(/email/i), 'jane@store.com')
    await userEvent.type(screen.getByLabelText(/password/i), 'correct')
    fireEvent.submit(screen.getByRole('button', { name: /sign in/i }))

    await waitFor(() =>
      expect(openSpy).toHaveBeenCalledWith(
        expect.stringContaining('/dashboard#token='),
        '_blank'
      )
    )
  })

  it('disables button while loading', async () => {
    let resolveRequest!: (v: unknown) => void
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(
      new Promise(res => { resolveRequest = res })
    ))
    renderPage()

    await userEvent.type(screen.getByLabelText(/email/i), 'a@b.com')
    await userEvent.type(screen.getByLabelText(/password/i), 'pass')
    fireEvent.submit(screen.getByRole('button', { name: /sign in/i }))

    expect(screen.getByRole('button', { name: /signing in/i })).toBeDisabled()

    // clean up pending promise
    resolveRequest({ ok: false, status: 401, json: () => Promise.resolve({}) })
  })
})

// ─── loginToPortal unit tests ─────────────────────────────────────────────────

describe('loginToPortal', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('returns token and user on 200', async () => {
    mockFetch(true, { token: 'abc123', user: { name: 'Jane' } })
    const result = await loginToPortal('jane@example.com', 'pass')
    expect(result.token).toBe('abc123')
    expect(result.user.name).toBe('Jane')
  })

  it('throws with server message on failure', async () => {
    mockFetch(false, { message: 'Account not found.' })
    await expect(loginToPortal('x@x.com', 'bad')).rejects.toThrow('Account not found.')
  })

  it('throws generic message when server sends no message', async () => {
    mockFetch(false, {}, 500)
    await expect(loginToPortal('x@x.com', 'bad')).rejects.toThrow('Invalid email or password.')
  })

  it('calls the correct endpoint', async () => {
    const fetchSpy = mockFetch(true, { token: 't', user: { name: 'A' } })
    await loginToPortal('a@b.com', 'pw')
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining('/api/auth/login'),
      expect.objectContaining({ method: 'POST' })
    )
  })
})
