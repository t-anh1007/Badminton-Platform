export type ServiceHealth = { key: string; label: string; state: 'available' | 'degraded' | 'unreachable' }

const services = [
  ['gateway', 'Cổng API', '/health'],
  ['account', 'Tài khoản', '/api/account/health'],
  ['venue', 'Sân và đặt sân', '/api/venue/health'],
  ['finance', 'Tài chính', '/api/finance/health'],
  ['matchmaking', 'Ghép kèo', '/api/matchmaking/health'],
  ['community', 'Cộng đồng', '/api/community/health'],
] as const

export async function getSystemHealth(): Promise<ServiceHealth[]> {
  return Promise.all(services.map(async ([key, label, url]) => {
    try {
      const response = await fetch(url)
      return { key, label, state: response.ok ? 'available' : 'degraded' } as ServiceHealth
    } catch {
      return { key, label, state: 'unreachable' } as ServiceHealth
    }
  }))
}
