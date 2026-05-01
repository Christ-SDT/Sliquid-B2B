import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import BecomeARetailerPage from '../pages/BecomeARetailerPage'

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('@emailjs/browser', () => ({
  default: { send: vi.fn() },
}))

// Stub env vars so the "not configured" guard never fires in tests
vi.mock('@/utils/constants', () => ({
  EMAILJS_PUBLIC_KEY:          'test-public-key',
  EMAILJS_SERVICE_ID:          'test-service-id',
  EMAILJS_RETAILER_ADMIN_TID:  'test-admin-tid',
  EMAILJS_RETAILER_CONFIRM_TID:'test-confirm-tid',
}))

import emailjs from '@emailjs/browser'
const mockSend = vi.mocked(emailjs.send)

function renderPage() {
  return render(<MemoryRouter><BecomeARetailerPage /></MemoryRouter>)
}

async function fillRequiredFields() {
  await userEvent.type(screen.getByLabelText(/company/i), 'Acme Wellness')
  const firstInput = screen.getByPlaceholderText('First')
  const lastInput  = screen.getByPlaceholderText('Last')
  await userEvent.type(firstInput, 'Jane')
  await userEvent.type(lastInput, 'Doe')
  // Address
  const streetInput = screen.getAllByRole('textbox').find(el =>
    (el as HTMLInputElement).name === 'streetAddress'
  )!
  await userEvent.type(streetInput, '123 Main St')
  await userEvent.type(screen.getByLabelText(/phone number/i), '5555555555')
  await userEvent.type(screen.getByLabelText(/email/i), 'jane@store.com')
  // City / State / Zip
  const cityInput = screen.getAllByRole('textbox').find(el =>
    (el as HTMLInputElement).name === 'city'
  )!
  await userEvent.type(cityInput, 'Dallas')
  const stateInput = screen.getAllByRole('textbox').find(el =>
    (el as HTMLInputElement).name === 'state'
  )!
  await userEvent.type(stateInput, 'TX')
  const zipInput = screen.getAllByRole('textbox').find(el =>
    (el as HTMLInputElement).name === 'zip'
  )!
  await userEvent.type(zipInput, '75201')
  // At least one brand
  await userEvent.click(screen.getByLabelText(/sliquid naturals/i))
  // MAP policy
  await userEvent.click(screen.getByRole('checkbox', { name: /map policy below/i }))
}

// ─── Render ───────────────────────────────────────────────────────────────────

describe('BecomeARetailerPage — render', () => {
  it('renders the page heading', () => {
    renderPage()
    expect(screen.getByText(/become a retailer or distributor/i)).toBeInTheDocument()
  })

  it('renders company, name, phone, email fields', () => {
    renderPage()
    expect(screen.getByLabelText(/company/i)).toBeInTheDocument()
    expect(screen.getByPlaceholderText('First')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Last')).toBeInTheDocument()
    expect(screen.getByLabelText(/phone number/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument()
  })

  it('renders all four brand checkboxes', () => {
    renderPage()
    expect(screen.getByLabelText(/sliquid naturals/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/sliquid organics/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/the balance collection/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/ride lube/i)).toBeInTheDocument()
  })

  it('renders the MAP policy checkbox and link', () => {
    renderPage()
    expect(screen.getByRole('checkbox', { name: /map policy below/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /minimum advertised price policy/i })).toBeInTheDocument()
  })

  it('renders the submit button', () => {
    renderPage()
    expect(screen.getByRole('button', { name: /submit/i })).toBeInTheDocument()
  })
})

// ─── Validation ───────────────────────────────────────────────────────────────

describe('BecomeARetailerPage — validation', () => {
  afterEach(() => vi.clearAllMocks())

  it('shows error when company is missing', async () => {
    renderPage()
    fireEvent.submit(screen.getByRole('button', { name: /submit/i }))
    await waitFor(() => expect(screen.getByText(/company is required/i)).toBeInTheDocument())
    expect(mockSend).not.toHaveBeenCalled()
  })

  it('shows error when first name is missing', async () => {
    renderPage()
    await userEvent.type(screen.getByLabelText(/company/i), 'Acme')
    fireEvent.submit(screen.getByRole('button', { name: /submit/i }))
    await waitFor(() => expect(screen.getByText(/first name is required/i)).toBeInTheDocument())
    expect(mockSend).not.toHaveBeenCalled()
  })

  it('shows error for invalid email', async () => {
    renderPage()
    await userEvent.type(screen.getByLabelText(/email/i), 'not-valid')
    fireEvent.submit(screen.getByRole('button', { name: /submit/i }))
    await waitFor(() => expect(screen.getByText(/valid email address is required/i)).toBeInTheDocument())
    expect(mockSend).not.toHaveBeenCalled()
  })

  it('shows error when no brand is selected', async () => {
    renderPage()
    await userEvent.type(screen.getByLabelText(/company/i), 'Acme')
    await userEvent.type(screen.getByPlaceholderText('First'), 'Jane')
    await userEvent.type(screen.getByPlaceholderText('Last'), 'Doe')
    await userEvent.type(screen.getByLabelText(/phone number/i), '5555555555')
    await userEvent.type(screen.getByLabelText(/email/i), 'jane@store.com')
    fireEvent.submit(screen.getByRole('button', { name: /submit/i }))
    await waitFor(() => expect(screen.getByText(/select at least one brand/i)).toBeInTheDocument())
    expect(mockSend).not.toHaveBeenCalled()
  })

  it('shows error when MAP policy is not agreed', async () => {
    renderPage()
    await userEvent.type(screen.getByLabelText(/company/i), 'Acme')
    await userEvent.type(screen.getByPlaceholderText('First'), 'Jane')
    await userEvent.type(screen.getByPlaceholderText('Last'), 'Doe')
    await userEvent.type(screen.getByLabelText(/phone number/i), '5555555555')
    await userEvent.type(screen.getByLabelText(/email/i), 'jane@store.com')
    await userEvent.click(screen.getByLabelText(/sliquid naturals/i))
    fireEvent.submit(screen.getByRole('button', { name: /submit/i }))
    await waitFor(() => expect(screen.getByText(/must agree to the sliquid map policy/i)).toBeInTheDocument())
    expect(mockSend).not.toHaveBeenCalled()
  })
})

// ─── Submission ───────────────────────────────────────────────────────────────

describe('BecomeARetailerPage — submission', () => {
  beforeEach(() => vi.clearAllMocks())

  it('calls emailjs.send twice (admin + confirm) on valid submission', async () => {
    mockSend.mockResolvedValue({ status: 200, text: 'OK' })
    renderPage()
    await fillRequiredFields()
    fireEvent.submit(screen.getByRole('button', { name: /submit/i }))
    await waitFor(() => expect(mockSend).toHaveBeenCalledTimes(2))
  })

  it('shows thank you modal after successful submission', async () => {
    mockSend.mockResolvedValue({ status: 200, text: 'OK' })
    renderPage()
    await fillRequiredFields()
    fireEvent.submit(screen.getByRole('button', { name: /submit/i }))
    await waitFor(() => expect(screen.getByText(/thank you for applying/i)).toBeInTheDocument())
  })

  it('disables submit button while sending', async () => {
    let resolve!: (v: any) => void
    mockSend.mockReturnValue(new Promise(r => { resolve = r }))
    renderPage()
    await fillRequiredFields()
    fireEvent.submit(screen.getByRole('button', { name: /submit/i }))
    await waitFor(() => expect(screen.getByRole('button', { name: /submitting/i })).toBeDisabled())
    resolve({ status: 200, text: 'OK' })
  })

  it('shows error banner when emailjs throws', async () => {
    mockSend.mockRejectedValue(new Error('Network error'))
    renderPage()
    await fillRequiredFields()
    fireEvent.submit(screen.getByRole('button', { name: /submit/i }))
    await waitFor(() => expect(screen.getByText(/something went wrong/i)).toBeInTheDocument())
  })
})
