import { afterAll, describe, expect, it } from 'vitest'
import { refreshSession, login, logout } from '../src/domain/session.js'
import { prisma } from '../src/lib/prisma.js'
import { redis } from '../src/lib/redis.js'
import { registerUser } from '../src/domain/registration.js'
import { verifyEmailCode } from '../src/domain/verification.js'
import { getLatestVerificationCode, uniqueEmail, VALID_PASSWORD } from './helpers.js'

afterAll(async () => {
  await prisma.$disconnect()
  redis.disconnect()
})

async function createVerifiedUser(email: string) {
  const { userId } = await registerUser({ email, password: VALID_PASSWORD, displayName: 'A' })
  await verifyEmailCode(email, await getLatestVerificationCode(userId))
  return userId
}

describe('D45 session refresh', () => {
  it('returns current roles and preserves the refresh token', async () => {
    const email = uniqueEmail()
    const userId = await createVerifiedUser(email)
    const original = await login(email, VALID_PASSWORD)
    await prisma.user.update({ where: { id: userId }, data: { roles: ['player', 'provider'] } })

    const refreshed = await refreshSession(original.refreshToken)
    const claims = JSON.parse(Buffer.from(refreshed.accessToken.split('.')[1], 'base64url').toString('utf8')) as { roles: string[] }

    expect(refreshed.refreshToken).toBe(original.refreshToken)
    expect(refreshed.roles).toEqual(['player', 'provider'])
    expect(claims.roles).toEqual(['player', 'provider'])
  })

  it('rejects a revoked refresh token', async () => {
    const email = uniqueEmail()
    await createVerifiedUser(email)
    const { refreshToken } = await login(email, VALID_PASSWORD)
    await logout(refreshToken)

    await expect(refreshSession(refreshToken)).rejects.toMatchObject({ code: 'INVALID_REFRESH_TOKEN', httpStatus: 401 })
  })

  it('rejects a locked account', async () => {
    const email = uniqueEmail()
    const userId = await createVerifiedUser(email)
    const { refreshToken } = await login(email, VALID_PASSWORD)
    await prisma.user.update({ where: { id: userId }, data: { status: 'locked' } })

    await expect(refreshSession(refreshToken)).rejects.toMatchObject({ code: 'ACCOUNT_LOCKED', httpStatus: 403 })
  })
})
