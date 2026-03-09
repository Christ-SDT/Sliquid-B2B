import { vi } from 'vitest'

process.env['DB_PATH'] = ':memory:'
process.env['JWT_SECRET'] = 'test-secret-for-vitest-only'
process.env['NODE_ENV'] = 'test'

// Keep output clean; preserve console.error for real failures
vi.spyOn(console, 'log').mockImplementation(() => {})
vi.spyOn(console, 'warn').mockImplementation(() => {})
