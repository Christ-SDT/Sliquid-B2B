import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import ResetPasswordPage from '../pages/ResetPasswordPage'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function renderWithToken(token: string | null = 'valid-token') {
  const search = token ? `?token=${token}` : ''
  return render(
    <MemoryRouter initialEntries={[`/reset-password${search}`]}>
      <Routes>
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="/partner-login" element={<div>Login page</div>} />
      </Routes>
    </MemoryRouter>
  )
}

function mockFetch(ok: boolean, body: object = {}, status = ok ? 200 : 400) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok, status, json: () => Promise.resolve(body),
  }))
}

// ─── No token ─────────────────────────────────────────────────────────────────

describe('ResetPasswordPage — no token', () => {
  it('shows invalid link screen when no token in URL', () => {
    renderWithToken(null)
    expect(screen.getByText(/invalid reset link/i)).toBeInTheDocument()
  })

  it('shows a link to request a new reset when token missing', () => {
    renderWithToken(null)
    expect(screen.getByRole('link', { name: /request a new link/i })).toBeInTheDocument()
  })

  it('does not render the password form when token is missing', () => {
    renderWithToken(null)
    expect(screen.queryByLabelText(/new password/i)).not.toBeInTheDocument()
  })
})

// ─── Render with token ────────────────────────────────────────────────────────

describe('ResetPasswordPage — render with token', () => {
  it('renders new password and confirm password inputs', () => {
    renderWithToken()
    expect(screen.getByLabelText('New password')).toBeInTheDocument()
    expect(screen.getByLabelText(/confirm new password/i)).toBeInTheDocument()
  })

  it('renders the reset password button', () => {
    renderWithToken()
    expect(screen.getByRole('button', { name: /reset password/i })).toBeInTheDocument()
  })

  it('does not show an error on initial render', () => {
    renderWithToken()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})

// ─── Validation ───────────────────────────────────────────────────────────────

describe('ResetPasswordPage — validation', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('shows error when password is less than 8 characters', async () => {
    renderWithToken()
    await userEvent.type(screen.getByLabelText('New password'), 'short')
    await userEvent.type(screen.getByLabelText(/confirm new password/i), 'short')
    fireEvent.submit(screen.getByRole('button', { name: /reset password/i }))
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(/at least 8 characters/i)
    )
  })

  it('shows error when passwords do not match', async () => {
    renderWithToken()
    await userEvent.type(screen.getByLabelText('New password'), 'password123')
    await userEvent.type(screen.getByLabelText(/confirm new password/i), 'different123')
    fireEvent.submit(screen.getByRole('button', { name: /reset password/i }))
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(/passwords do not match/i)
    )
  })

  it('does not call fetch when validation fails', async () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    renderWithToken()
    await userEvent.type(screen.getByLabelText('New password'), 'short')
    await userEvent.type(screen.getByLabelText(/confirm new password/i), 'short')
    fireEvent.submit(screen.getByRole('button', { name: /reset password/i }))
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument())
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})

// ─── Submission ───────────────────────────────────────────────────────────────

describe('ResetPasswordPage — submission', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('navigates to login page on success', async () => {
    mockFetch(true)
    renderWithToken()
    await userEvent.type(screen.getByLabelText('New password'), 'newpassword123')
    await userEvent.type(screen.getByLabelText(/confirm new password/i), 'newpassword123')
    fireEvent.submit(screen.getByRole('button', { name: /reset password/i }))
    await waitFor(() => expect(screen.getByText(/login page/i)).toBeInTheDocument())
  })

  it('shows server error message on failure', async () => {
    mockFetch(false, { message: 'Token has expired.' })
    renderWithToken()
    await userEvent.type(screen.getByLabelText('New password'), 'newpassword123')
    await userEvent.type(screen.getByLabelText(/confirm new password/i), 'newpassword123')
    fireEvent.submit(screen.getByRole('button', { name: /reset password/i }))
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(/token has expired/i)
    )
  })

  it('disables the button while loading', async () => {
    let resolve!: (v: any) => void
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(new Promise(r => { resolve = r })))
    renderWithToken()
    await userEvent.type(screen.getByLabelText('New password'), 'newpassword123')
    await userEvent.type(screen.getByLabelText(/confirm new password/i), 'newpassword123')
    fireEvent.submit(screen.getByRole('button', { name: /reset password/i }))
    await waitFor(() => expect(screen.getByRole('button', { name: /saving/i })).toBeDisabled())
    resolve({ ok: true, status: 200, json: () => Promise.resolve({}) })
  })

  it('shows error banner on network failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')))
    renderWithToken()
    await userEvent.type(screen.getByLabelText('New password'), 'newpassword123')
    await userEvent.type(screen.getByLabelText(/confirm new password/i), 'newpassword123')
    fireEvent.submit(screen.getByRole('button', { name: /reset password/i }))
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(/something went wrong/i)
    )
  })

  it('sends the token from the URL to the API', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve({}) })
    vi.stubGlobal('fetch', fetchSpy)
    renderWithToken('my-test-token')
    await userEvent.type(screen.getByLabelText('New password'), 'newpassword123')
    await userEvent.type(screen.getByLabelText(/confirm new password/i), 'newpassword123')
    fireEvent.submit(screen.getByRole('button', { name: /reset password/i }))
    await waitFor(() =>
      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringContaining('/api/auth/reset-password'),
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('my-test-token'),
        })
      )
    )
  })
})
