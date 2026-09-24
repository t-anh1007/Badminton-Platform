/** Display only: API calls and access checks continue to use the original UUID. */
export function BusinessCode({ code, label = 'Mã' }: { code?: string | null; label?: string }) {
  return <span className="mt-1 block text-xs text-ink-500">{label}: <span className="font-mono font-semibold select-all">{code || 'Chưa có mã'}</span></span>;
}
