const BASE = (import.meta.env.VITE_API_URL ?? '') + '/api'

function getToken() {
  return localStorage.getItem('portal_token')
}

export function clearToken() {
  localStorage.removeItem('portal_token')
}

export function setToken(token: string) {
  localStorage.setItem('portal_token', token)
}

/**
 * Thrown for a non-2xx response. `message` is exactly what it always was (the
 * server's English text), so existing callers are unaffected; `code`/`params`
 * let a page translate the error via serverErrorText().
 */
export class ApiError extends Error {
  constructor(message: string, public status: number, public code?: string, public params?: Record<string, unknown>) {
    super(message)
    this.name = 'ApiError'
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken()
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers ?? {}),
    },
  })
  // A 401 means an expired session — except on the auth endpoints themselves,
  // where it means wrong credentials. Redirecting there reloaded the login page
  // and swallowed the "Invalid email or password" message.
  if (res.status === 401 && !path.startsWith('/auth/')) {
    clearToken()
    window.location.href = '/login'
    throw new Error('Unauthorized')
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: 'Request failed' }))
    throw new ApiError(err.message ?? 'Request failed', res.status, err.code, err.params)
  }
  return res.json()
}

async function requestForm<T>(path: string, method: 'POST' | 'PUT', formData: FormData): Promise<T> {
  const token = getToken()
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: formData,
  })
  if (res.status === 401) {
    clearToken()
    window.location.href = '/login'
    throw new Error('Unauthorized')
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: 'Request failed' }))
    throw new Error(err.message ?? err.error ?? 'Request failed')
  }
  return res.json()
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'POST', body: JSON.stringify(body) }),
  put: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'PUT', body: JSON.stringify(body) }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
  postForm: <T>(path: string, formData: FormData) => requestForm<T>(path, 'POST', formData),
  putForm: <T>(path: string, formData: FormData) => requestForm<T>(path, 'PUT', formData),
}
