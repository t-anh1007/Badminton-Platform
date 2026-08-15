import { useCallback, useEffect, useState } from 'react'
import { Badge, SurfaceCard } from '../../components/ui'
import { getSystemHealth, type ServiceHealth } from '../../lib/systemHealthApi'
import { RouteState } from '../../components/RouteState.js'

export function AdminOverviewPage() {
  const [rows, setRows] = useState<ServiceHealth[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const load = useCallback(async () => { setLoading(true); setError(''); try { setRows(await getSystemHealth()) } catch (cause) { setError(cause instanceof Error ? cause.message : 'Không thể tải trạng thái hệ thống.') } finally { setLoading(false) } }, [])
  useEffect(() => { void load() }, [load])
  return <><h2 className="text-h1">Tổng quan hệ thống</h2><p className="mt-2 text-ink-500">Trạng thái các dịch vụ nghiệp vụ, không hiển thị cấu hình bí mật.</p><div className="mt-6">{loading ? <RouteState variant="loading" title="Đang kiểm tra dịch vụ" /> : error ? <RouteState variant="error" title="Không thể tải trạng thái hệ thống" description={error} onRetry={() => void load()} /> : <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{rows.map((row) => <SurfaceCard key={row.key}><p className="font-bold text-brand-navy">{row.label}</p><Badge tone={row.state === 'available' ? 'success' : row.state === 'degraded' ? 'warning' : 'danger'}>{row.state === 'available' ? 'Sẵn sàng' : row.state === 'degraded' ? 'Suy giảm' : 'Không kết nối'}</Badge></SurfaceCard>)}</div>}</div></>
}
