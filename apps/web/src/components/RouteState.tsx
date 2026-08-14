import type { ReactNode } from 'react'

export type RouteStateVariant = 'loading' | 'empty' | 'error' | 'forbidden'

const defaults: Record<RouteStateVariant, { title: string; description: string; symbol: string }> = {
  loading: { title: 'Đang tải dữ liệu', description: 'Vui lòng chờ trong giây lát.', symbol: '…' },
  empty: { title: 'Chưa có dữ liệu', description: 'Nội dung sẽ xuất hiện tại đây khi sẵn sàng.', symbol: '⌁' },
  error: { title: 'Không thể tải nội dung', description: 'Đã có lỗi xảy ra. Bạn có thể thử lại.', symbol: '!' },
  forbidden: { title: 'Bạn chưa có quyền truy cập', description: 'Hãy chọn đúng vai trò hoặc quay về trang chủ.', symbol: '×' },
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
      className={`surface-card flex min-h-48 flex-col items-center justify-center p-8 text-center ${className}`}
    >
      <span aria-hidden className={`grid h-12 w-12 place-items-center rounded-full text-xl font-bold ${isFailure ? 'bg-danger-bg text-danger' : 'bg-green-50 text-brand-navy'} ${isLoading ? 'animate-pulse' : ''}`}>
        {copy.symbol}
      </span>
      <h2 className="mt-3 text-h3">{title ?? copy.title}</h2>
      <p className="mt-2 max-w-md text-sm text-ink-500">{description ?? copy.description}</p>
      {(onRetry || action) && (
        <div className="mt-5 flex flex-wrap justify-center gap-3">
          {onRetry && <button type="button" onClick={onRetry} className="inline-flex min-h-11 items-center justify-center rounded-full bg-brand-yellow px-5 py-2.5 text-sm font-bold uppercase tracking-[0.035em] text-brand-navy hover:bg-brand-yellow-hover">Thử lại</button>}
          {action}
        </div>
      )}
    </section>
  )
}
