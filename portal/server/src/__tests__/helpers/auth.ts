import jwt, { type SignOptions } from 'jsonwebtoken'

const SECRET = process.env['JWT_SECRET']!

export const makeToken = (userId: number, role: string, exp: SignOptions['expiresIn'] = '1h') =>
  jwt.sign({ userId, role }, SECRET, { expiresIn: exp })

export const makeExpiredToken = (userId: number, role: string) =>
  jwt.sign({ userId, role, exp: Math.floor(Date.now() / 1000) - 1 }, SECRET)

export const makeInvalidToken = (userId: number, role: string) =>
  jwt.sign({ userId, role }, 'wrong-secret')

export const bearerToken = (userId: number, role: string) =>
  `Bearer ${makeToken(userId, role)}`
