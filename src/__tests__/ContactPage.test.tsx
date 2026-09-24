import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import ContactPage from '../pages/ContactPage'

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('@/utils/constants', () => ({
  EMAILJS_PUBLIC_KEY:           'test-public-key',
  EMAILJS_SERVICE_ID:           'test-service-id',
  EMAILJS_CONTACT_ADMIN_TID:    'test-admin-tid',
  EMAILJS_CONTACT_REPLY_TID:    'test-reply-tid',
  EMAILJS_NEWSLETTER_TID:       'test-newsletter-tid',
  EMAILJS_HP_TID:               'test-hp-tid',
  EMAILJS_RETAILER_ADMIN_TID:   'test-retailer-admin-tid',
  EMAILJS_RETAILER_CONFIRM_TID: 'test-retailer-confirm-tid',
}))

// Validation tests assert that nothing is sent. Every test gets a fetch spy;
// submission tests replace it with their own response.
let fetchSpy: ReturnType<typeof vi.fn>
beforeEach(() => {
  fetchSpy = vi.fn().mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve({}) })
  vi.stubGlobal('fetch', fetchSpy)
})
afterEach(() => vi.unstubAllGlobals())

function renderPage() {
  return render(<MemoryRouter><ContactPage /></MemoryRouter>)
}

async function fillRequiredFields() {
  await userEvent.type(screen.getByLabelText(/full name/i), 'Jane Doe')
  await userEvent.type(screen.getByLabelText(/company/i), 'Acme Wellness')
  await userEvent.type(screen.getByLabelText(/^email/i, { selector: 'input' }), 'jane@store.com')
  await userEvent.selectOptions(screen.getByLabelText(/inquiry type/i), 'retailer')
  await userEvent.type(screen.getByLabelText(/message/i), 'Hello, I would like more info about wholesale.')
}


// ─── Render ───────────────────────────────────────────────────────────────────

describe('ContactPage — render', () => {
  it('renders all required form fields', () => {
    renderPage()
    expect(screen.getByLabelText(/full name/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/email/i, { selector: 'input' })).toBeInTheDocument()
    expect(screen.getByLabelText(/inquiry type/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/message/i)).toBeInTheDocument()
  })

  it('renders the submit button', () => {
    renderPage()
    expect(screen.getByRole('button', { name: /send message/i })).toBeInTheDocument()
  })

  it('does not show errors on initial render', () => {
    renderPage()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})

// ─── Validation ───────────────────────────────────────────────────────────────

describe('ContactPage — validation', () => {
  afterEach(() => vi.clearAllMocks())

  it('shows error when name is missing', async () => {
    renderPage()
    await userEvent.type(screen.getByLabelText(/^email/i, { selector: 'input' }), 'jane@store.com')
    await userEvent.selectOptions(screen.getByLabelText(/inquiry type/i), 'retailer')
    await userEvent.type(screen.getByLabelText(/message/i), 'Hello, I would like more info about wholesale.')
    await userEvent.click(screen.getByRole('button', { name: /send message/i }))
    await waitFor(() => expect(screen.getByText(/full name is required/i)).toBeInTheDocument())
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('shows error for invalid email', async () => {
    renderPage()
    await userEvent.type(screen.getByLabelText(/full name/i), 'Jane')
    await userEvent.type(screen.getByLabelText(/^email/i, { selector: 'input' }), 'not-an-email')
    await userEvent.selectOptions(screen.getByLabelText(/inquiry type/i), 'retailer')
    await userEvent.type(screen.getByLabelText(/message/i), 'Hello, I would like more info about wholesale.')
    await userEvent.click(screen.getByRole('button', { name: /send message/i }))
    await waitFor(() => expect(screen.getByText(/valid email address/i)).toBeInTheDocument())
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('shows error when inquiry type is not selected', async () => {
    renderPage()
    await userEvent.type(screen.getByLabelText(/full name/i), 'Jane')
    await userEvent.type(screen.getByLabelText(/^email/i, { selector: 'input' }), 'jane@store.com')
    await userEvent.type(screen.getByLabelText(/message/i), 'Hello, I would like more info about wholesale.')
    await userEvent.click(screen.getByRole('button', { name: /send message/i }))
    await waitFor(() => expect(screen.getByText(/select an inquiry type/i)).toBeInTheDocument())
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('shows error when message is too short', async () => {
    renderPage()
    await userEvent.type(screen.getByLabelText(/full name/i), 'Jane')
    await userEvent.type(screen.getByLabelText(/^email/i, { selector: 'input' }), 'jane@store.com')
    await userEvent.selectOptions(screen.getByLabelText(/inquiry type/i), 'retailer')
    await userEvent.type(screen.getByLabelText(/message/i), 'Too short')
    await userEvent.click(screen.getByRole('button', { name: /send message/i }))
    await waitFor(() => expect(screen.getByText(/at least 20 characters/i)).toBeInTheDocument())
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})

// ─── Submission ───────────────────────────────────────────────────────────────

describe('ContactPage — submission', () => {
  // The page posts to /api/b2b/contact with fetch. These tests used to mock
  // emailjs (no longer used) and so submitted to the PRODUCTION API on every run.
  const ok = () => vi.fn().mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve({}) })
  afterEach(() => {
    vi.unstubAllGlobals()
    window.localStorage.clear() // a successful submit starts the 1h cooldown
  })

  it('posts the message to /api/b2b/contact on valid submission', async () => {
    const fetchSpy = ok()
    vi.stubGlobal('fetch', fetchSpy)
    renderPage()
    await fillRequiredFields()
    await userEvent.click(screen.getByRole('button', { name: /send message/i }))
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledWith(expect.stringContaining('/api/b2b/contact'), expect.objectContaining({ method: 'POST' })))
    const body = JSON.parse(fetchSpy.mock.calls[0][1].body)
    expect(body).toMatchObject({ fromName: 'Jane Doe', fromEmail: 'jane@store.com', company: 'Acme Wellness', subject: 'retailer' })
  })

  it('disables the submit button while sending', async () => {
    let resolve!: (v: unknown) => void
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(new Promise(r => { resolve = r })))
    renderPage()
    await fillRequiredFields()
    await userEvent.click(screen.getByRole('button', { name: /send message/i }))
    await waitFor(() => expect(screen.getByRole('button', { name: /sending/i })).toBeDisabled())
    resolve({ ok: true, status: 200, json: () => Promise.resolve({}) })
  })

  it('shows "Message Sent" success heading after the server accepts it', async () => {
    vi.stubGlobal('fetch', ok())
    renderPage()
    await fillRequiredFields()
    await userEvent.click(screen.getByRole('button', { name: /send message/i }))
    await waitFor(() => expect(screen.getByText(/message sent/i)).toBeInTheDocument())
  })

  it('re-enables the submit button and shows no success when the request fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))
    renderPage()
    await fillRequiredFields()
    await userEvent.click(screen.getByRole('button', { name: /send message/i }))
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /send message/i })).not.toBeDisabled()
    )
    expect(screen.queryByText(/message sent/i)).not.toBeInTheDocument()
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
    await fillRequiredFields()
    if (switchTo) {
      const { default: i18n } = await import('@/i18n')
      await act(async () => { await i18n.changeLanguage(switchTo) })
    }
    fireEvent.submit(container.querySelector('form')!)
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledWith(expect.stringContaining('/api/b2b/contact'), expect.anything()))
    const [, init] = fetchSpy.mock.calls.find(([url]) => String(url).includes('/api/b2b/contact'))!
    return JSON.parse(init.body as string) as Record<string, unknown>
  }

  it('sends language "en" by default', async () => {
    expect((await submittedBody()).language).toBe('en')
  })

  it('sends the language the visitor switched to', async () => {
    expect((await submittedBody('es')).language).toBe('es')
  })
})
