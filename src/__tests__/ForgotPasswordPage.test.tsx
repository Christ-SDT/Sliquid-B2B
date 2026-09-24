import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import ForgotPasswordPage from '../pages/ForgotPasswordPage'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function renderPage() {
  return render(<MemoryRouter><ForgotPasswordPage /></MemoryRouter>)
}

function mockFetch(ok: boolean, body: object = {}, status = ok ? 200 : 400) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok, status, json: () => Promise.resolve(body),
  }))
}

// ─── Render ───────────────────────────────────────────────────────────────────

describe('ForgotPasswordPage — render', () => {
  it('renders the email input', () => {
    renderPage()
    expect(screen.getByLabelText(/email address/i)).toBeInTheDocument()
  })

  it('renders the send reset link button', () => {
    renderPage()
    expect(screen.getByRole('button', { name: /send reset link/i })).toBeInTheDocument()
  })

  it('renders a back to sign in link', () => {
    renderPage()
    expect(screen.getByRole('link', { name: /back to sign in/i })).toBeInTheDocument()
  })

  it('does not show an error on initial render', () => {
    renderPage()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})

// ─── Validation ───────────────────────────────────────────────────────────────

describe('ForgotPasswordPage — validation', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('shows error when email is empty and form is submitted', async () => {
    renderPage()
    fireEvent.submit(screen.getByRole('button', { name: /send reset link/i }))
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(/enter your email address/i)
    )
  })

  it('does not call fetch when email is empty', async () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    renderPage()
    fireEvent.submit(screen.getByRole('button', { name: /send reset link/i }))
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument())
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})

// ─── Submission ───────────────────────────────────────────────────────────────

describe('ForgotPasswordPage — submission', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('shows success screen after submit (server ok)', async () => {
    mockFetch(true)
    renderPage()
    await userEvent.type(screen.getByLabelText(/email address/i), 'jane@store.com')
    fireEvent.submit(screen.getByRole('button', { name: /send reset link/i }))
    await waitFor(() => expect(screen.getByText(/check your email/i)).toBeInTheDocument())
  })

  it('shows success screen even when server returns non-ok (no enumeration)', async () => {
    mockFetch(false, {}, 404)
    renderPage()
    await userEvent.type(screen.getByLabelText(/email address/i), 'unknown@store.com')
    fireEvent.submit(screen.getByRole('button', { name: /send reset link/i }))
    await waitFor(() => expect(screen.getByText(/check your email/i)).toBeInTheDocument())
  })

  it('displays the submitted email in the success screen', async () => {
    mockFetch(true)
    renderPage()
    await userEvent.type(screen.getByLabelText(/email address/i), 'jane@store.com')
    fireEvent.submit(screen.getByRole('button', { name: /send reset link/i }))
    await waitFor(() => expect(screen.getByText('jane@store.com')).toBeInTheDocument())
  })

  it('disables the button while loading', async () => {
    let resolve!: (v: any) => void
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(new Promise(r => { resolve = r })))
    renderPage()
    await userEvent.type(screen.getByLabelText(/email address/i), 'jane@store.com')
    fireEvent.submit(screen.getByRole('button', { name: /send reset link/i }))
    await waitFor(() => expect(screen.getByRole('button', { name: /sending/i })).toBeDisabled())
    resolve({ ok: true, status: 200, json: () => Promise.resolve({}) })
  })

  it('shows error banner when fetch throws (network failure)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')))
    renderPage()
    await userEvent.type(screen.getByLabelText(/email address/i), 'jane@store.com')
    fireEvent.submit(screen.getByRole('button', { name: /send reset link/i }))
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(/something went wrong/i)
    )
  })

  it('calls the correct API endpoint', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve({}) })
    vi.stubGlobal('fetch', fetchSpy)
    renderPage()
    await userEvent.type(screen.getByLabelText(/email address/i), 'jane@store.com')
    fireEvent.submit(screen.getByRole('button', { name: /send reset link/i }))
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining('/api/auth/forgot-password'),
      expect.objectContaining({ method: 'POST' })
    ))
  })
})

// ─── Language (Phase 5: server sends the partner's email in this language) ───

describe('request carries the visitor language', () => {
  afterEach(async () => {
    vi.unstubAllGlobals()
    window.localStorage.clear() // a successful submit starts the 1h cooldown
    const { default: i18n } = await import('@/i18n')
    await i18n.changeLanguage('en')
  })

  async function submittedBody(switchTo?: 'es' | 'fr') {
    const fetchSpy = vi.fn().mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve({}) })
    vi.stubGlobal('fetch', fetchSpy)
    const { container } = renderPage()
    await userEvent.type(screen.getByLabelText(/email address/i), 'jane@store.com')
    if (switchTo) {
      const { default: i18n } = await import('@/i18n')
      await act(async () => { await i18n.changeLanguage(switchTo) })
    }
    fireEvent.submit(container.querySelector('form')!)
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledWith(expect.stringContaining('/api/auth/forgot-password'), expect.anything()))
    const [, init] = fetchSpy.mock.calls.find(([url]) => String(url).includes('/api/auth/forgot-password'))!
    return JSON.parse(init.body as string) as Record<string, unknown>
  }

  it('sends language "en" by default', async () => {
    expect((await submittedBody()).language).toBe('en')
  })

  it('sends the language the visitor switched to', async () => {
    expect((await submittedBody('es')).language).toBe('es')
  })
})
