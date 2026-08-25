import { describe, it, expect } from 'vitest'
import {
  ADMIN_ROLES,
  ADMIN_VIEWER_ROLES,
  isAdminRole,
  canViewAdmin,
  isReadOnlyAdminRole,
} from '../roles.js'

// A comprehensive-enough sample to exercise every branch: every tier, the
// legacy DB value, absent/empty/null, a case-mismatch, and a role that looks
// legal-ish but isn't the real constant, to prove nothing string-matches by
// accident.
const ALL_CANDIDATE_ROLES: Array<string | undefined | null> = [
  'tier1', 'tier2', 'tier3', 'tier4', 'tier5', 'tier6', 'tier7', 'tier8',
  'admin', undefined, null, '', 'TIER5', 'sliquid_legal',
]

describe('roles.ts — canViewAdmin is a strict superset of isAdminRole', () => {
  it('every role admitted by isAdminRole is also admitted by canViewAdmin', () => {
    for (const role of ALL_CANDIDATE_ROLES) {
      if (isAdminRole(role)) {
        expect(canViewAdmin(role), `canViewAdmin(${JSON.stringify(role)}) should be true`).toBe(true)
      }
    }
  })

  it('at least one role is admitted by canViewAdmin but not isAdminRole (proves "strict")', () => {
    const diverging = ALL_CANDIDATE_ROLES.filter(r => canViewAdmin(r) && !isAdminRole(r))
    expect(diverging.length).toBeGreaterThan(0)
  })
})

describe('roles.ts — tier8 (Legal)', () => {
  it('canViewAdmin(tier8) is true', () => {
    expect(canViewAdmin('tier8')).toBe(true)
  })

  it('isAdminRole(tier8) is false — Legal cannot write', () => {
    expect(isAdminRole('tier8')).toBe(false)
  })

  it('isReadOnlyAdminRole(tier8) is true', () => {
    expect(isReadOnlyAdminRole('tier8')).toBe(true)
  })
})

describe('roles.ts — isReadOnlyAdminRole is false for every write-capable admin role', () => {
  it('every member of ADMIN_ROLES is rejected by isReadOnlyAdminRole', () => {
    for (const role of ADMIN_ROLES) {
      expect(isReadOnlyAdminRole(role), `isReadOnlyAdminRole(${role}) should be false`).toBe(false)
    }
  })
})

describe('roles.ts — invariant 1: ADMIN_ROLES and ADMIN_VIEWER_ROLES are disjoint', () => {
  it('no role appears in both sets', () => {
    for (const role of ADMIN_ROLES) {
      expect(ADMIN_VIEWER_ROLES.has(role), `${role} should not be in ADMIN_VIEWER_ROLES`).toBe(false)
    }
    for (const role of ADMIN_VIEWER_ROLES) {
      expect(ADMIN_ROLES.has(role), `${role} should not be in ADMIN_ROLES`).toBe(false)
    }
  })
})

describe('roles.ts — unknown / absent / empty roles get nothing from any helper', () => {
  const nothingRoles: Array<string | undefined | null> = [undefined, null, '', 'bogus-role', 'sliquid_legal']

  it.each(nothingRoles)('role %p is rejected by all three helpers', (role) => {
    expect(isAdminRole(role)).toBe(false)
    expect(canViewAdmin(role)).toBe(false)
    expect(isReadOnlyAdminRole(role)).toBe(false)
  })
})
