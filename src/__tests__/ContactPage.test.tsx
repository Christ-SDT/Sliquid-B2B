import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import ContactPage from '../pages/ContactPage'

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('@emailjs/browser', () => ({
  default: { send: vi.fn() },
}))

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

import emailjs from '@emailjs/browser'
const mockSend = vi.mocked(emailjs.send)

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
    expect(mockSend).not.toHaveBeenCalled()
  })

  it('shows error for invalid email', async () => {
    renderPage()
    await userEvent.type(screen.getByLabelText(/full name/i), 'Jane')
    await userEvent.type(screen.getByLabelText(/^email/i, { selector: 'input' }), 'not-an-email')
    await userEvent.selectOptions(screen.getByLabelText(/inquiry type/i), 'retailer')
    await userEvent.type(screen.getByLabelText(/message/i), 'Hello, I would like more info about wholesale.')
    await userEvent.click(screen.getByRole('button', { name: /send message/i }))
    await waitFor(() => expect(screen.getByText(/valid email address/i)).toBeInTheDocument())
    expect(mockSend).not.toHaveBeenCalled()
  })

  it('shows error when inquiry type is not selected', async () => {
    renderPage()
    await userEvent.type(screen.getByLabelText(/full name/i), 'Jane')
    await userEvent.type(screen.getByLabelText(/^email/i, { selector: 'input' }), 'jane@store.com')
    await userEvent.type(screen.getByLabelText(/message/i), 'Hello, I would like more info about wholesale.')
    await userEvent.click(screen.getByRole('button', { name: /send message/i }))
    await waitFor(() => expect(screen.getByText(/select an inquiry type/i)).toBeInTheDocument())
    expect(mockSend).not.toHaveBeenCalled()
  })

  it('shows error when message is too short', async () => {
    renderPage()
    await userEvent.type(screen.getByLabelText(/full name/i), 'Jane')
    await userEvent.type(screen.getByLabelText(/^email/i, { selector: 'input' }), 'jane@store.com')
    await userEvent.selectOptions(screen.getByLabelText(/inquiry type/i), 'retailer')
    await userEvent.type(screen.getByLabelText(/message/i), 'Too short')
    await userEvent.click(screen.getByRole('button', { name: /send message/i }))
    await waitFor(() => expect(screen.getByText(/at least 20 characters/i)).toBeInTheDocument())
    expect(mockSend).not.toHaveBeenCalled()
  })
})

// ─── Submission ───────────────────────────────────────────────────────────────

describe('ContactPage — submission', () => {
  beforeEach(() => vi.clearAllMocks())

  it('calls emailjs.send on valid submission', async () => {
    mockSend.mockResolvedValue({ status: 200, text: 'OK' })
    renderPage()
    await fillRequiredFields()
    await userEvent.click(screen.getByRole('button', { name: /send message/i }))
    await waitFor(() => expect(mockSend).toHaveBeenCalled())
  })

  it('disables the submit button while sending', async () => {
    let resolve!: (v: any) => void
    mockSend.mockReturnValue(new Promise(r => { resolve = r }))
    renderPage()
    await fillRequiredFields()
    await userEvent.click(screen.getByRole('button', { name: /send message/i }))
    await waitFor(() => expect(screen.getByRole('button', { name: /sending/i })).toBeDisabled())
    resolve({ status: 200, text: 'OK' })
  })

  it('shows "Message Sent" success heading after sending', async () => {
    mockSend.mockResolvedValue({ status: 200, text: 'OK' })
    renderPage()
    await fillRequiredFields()
    await userEvent.click(screen.getByRole('button', { name: /send message/i }))
    await waitFor(() => expect(screen.getByText(/message sent/i)).toBeInTheDocument())
  })

  it('re-enables submit button after emailjs throws without crashing', async () => {
    mockSend.mockRejectedValue(new Error('Network error'))
    renderPage()
    await fillRequiredFields()
    await userEvent.click(screen.getByRole('button', { name: /send message/i }))
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /send message/i })).not.toBeDisabled()
    )
    expect(screen.queryByText(/message sent/i)).not.toBeInTheDocument()
  })
})
