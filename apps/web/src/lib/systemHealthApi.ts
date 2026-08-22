export type ServiceHealth = { key: string; label: string; state: 'available' | 'degraded' | 'unreachable' }

const accountBase = import.meta.env.VITE_ACCOUNT_URL ?? '/api/account'

function gatewayHealthUrl(): string {
  if (!/^https?:\/\//i.test(accountBase)) return '/health'
  return `${new URL(accountBase).origin}/health`
}

const services = [
  ['gateway', 'Cổng API', gatewayHealthUrl()],
  ['account', 'Tài khoản', `${accountBase}/health`],
  ['venue', 'Sân và đặt sân', `${import.meta.env.VITE_VENUE_BOOKING_URL ?? '/api/venue'}/health`],
  ['finance', 'Tài chính', `${import.meta.env.VITE_FINANCE_URL ?? '/api/finance'}/health`],
  ['matchmaking', 'Ghép kèo', `${import.meta.env.VITE_MATCHMAKING_URL ?? '/api/matchmaking'}/health`],
  ['community', 'Cộng đồng', `${import.meta.env.VITE_COMMUNITY_URL ?? '/api/community'}/health`],
] as const

export async function getSystemHealth(): Promise<ServiceHealth[]> {
  return Promise.all(services.map(async ([key, label, url]) => {
    try {
      const response = await fetch(url)
      const isJson = response.headers.get('content-type')?.includes('application/json') ?? false
      const body = isJson ? await response.json().catch(() => null) : null
      const healthy = response.ok && body?.status === 'ok'
      return { key, label, state: healthy ? 'available' : 'degraded' } as ServiceHealth
    } catch {
      return { key, label, state: 'unreachable' } as ServiceHealth
    }
  }))
}
