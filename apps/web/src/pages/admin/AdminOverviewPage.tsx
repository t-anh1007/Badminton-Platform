import { useEffect, useState } from 'react'
import { Badge, Skeleton, SurfaceCard } from '../../components/ui'
import { getSystemHealth, type ServiceHealth } from '../../lib/systemHealthApi'

export function AdminOverviewPage() {
  const [rows, setRows] = useState<ServiceHealth[]>([])
  useEffect(() => { void getSystemHealth().then(setRows) }, [])
  return <><h2 className="text-h1">Tổng quan hệ thống</h2><p className="mt-2 text-ink-500">Trạng thái các dịch vụ nghiệp vụ, không hiển thị cấu hình bí mật.</p><div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{rows.length ? rows.map((row) => <SurfaceCard key={row.key}><p className="font-bold text-brand-navy">{row.label}</p><Badge tone={row.state === 'available' ? 'success' : row.state === 'degraded' ? 'warning' : 'danger'}>{row.state === 'available' ? 'Sẵn sàng' : row.state === 'degraded' ? 'Suy giảm' : 'Không kết nối'}</Badge></SurfaceCard>) : [0, 1, 2].map((item) => <Skeleton key={item} className="h-28" />)}</div></>
}
