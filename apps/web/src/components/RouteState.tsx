import type { ReactNode } from 'react'
import { Icon, type IconName } from './Icon'

export type RouteStateVariant = 'loading' | 'empty' | 'error' | 'forbidden' | 'notFound'

const defaults: Record<RouteStateVariant, { title: string; description: string; icon: IconName; tone: string }> = {
  loading: { title: 'Đang tải dữ liệu', description: 'Vui lòng chờ trong giây lát.', icon: 'clock', tone: 'bg-green-50 text-brand-navy' },
  empty: { title: 'Chưa có dữ liệu', description: 'Nội dung sẽ xuất hiện tại đây khi sẵn sàng.', icon: 'searchOff', tone: 'bg-green-50 text-brand-navy' },
  error: { title: 'Không thể tải nội dung', description: 'Đã có lỗi xảy ra. Bạn có thể thử lại.', icon: 'alert', tone: 'bg-danger-bg text-danger' },
  forbidden: { title: 'Bạn chưa có quyền truy cập', description: 'Hãy chọn đúng vai trò hoặc quay về trang chủ.', icon: 'lock', tone: 'bg-danger-bg text-danger' },
  notFound: { title: 'Không tìm thấy nội dung', description: 'Nội dung có thể đã bị gỡ hoặc đường dẫn không đúng.', icon: 'mapOff', tone: 'bg-canvas text-ink-700' },
}

export function RouteState({
  variant,
  title,
  description,
  onRetry,
  action,
  className = '',
}: {
  variant: RouteStateVariant
  title?: string
  description?: string
  onRetry?: () => void
  action?: ReactNode
  className?: string
}) {
  const copy = defaults[variant]
  const isLoading = variant === 'loading'
  const isFailure = variant === 'error' || variant === 'forbidden'
  return (
    <section
      data-route-state={variant}
      role={isFailure ? 'alert' : 'status'}
      aria-live={isFailure ? 'assertive' : 'polite'}
      aria-busy={isLoading || undefined}
      className={`surface-card flex min-h-56 flex-col items-center justify-center px-6 py-10 text-center ${className}`}
    >
      <span aria-hidden className={`grid h-16 w-16 place-items-center rounded-[1.25rem] ${copy.tone} ${isLoading ? 'animate-pulse' : ''}`}>
        <Icon name={copy.icon} className="h-7 w-7" />
      </span>
      <h2 className="mt-4 text-h3">{title ?? copy.title}</h2>
      <p className="mt-2 max-w-md text-sm leading-6 text-ink-500">{description ?? copy.description}</p>
      {(onRetry || action) && (
        <div className="mt-5 flex flex-wrap justify-center gap-3">
          {onRetry && <button type="button" onClick={onRetry} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-brand-yellow px-5 py-2.5 text-sm font-bold uppercase tracking-[0.035em] text-brand-navy hover:bg-brand-yellow-hover"><Icon name="refresh" className="h-4 w-4" />Thử lại</button>}
          {action}
        </div>
      )}
    </section>
  )
}
