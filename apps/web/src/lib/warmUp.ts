// Backend chạy chế độ serverless trên Railway: service ngủ sau ~10 phút không
// có request và mất vài chục giây để thức lại. Bắn sẵn một lượt ping ngay khi
// trang được tải, để lúc người xem bấm vào chức năng đầu tiên thì backend đã
// dậy xong. Fire-and-forget: không chặn render, không quan tâm kết quả.
const bases = [
  import.meta.env.VITE_ACCOUNT_URL ?? '/api/account',
  import.meta.env.VITE_VENUE_BOOKING_URL ?? '/api/venue',
  import.meta.env.VITE_FINANCE_URL ?? '/api/finance',
  import.meta.env.VITE_MATCHMAKING_URL ?? '/api/matchmaking',
  import.meta.env.VITE_COMMUNITY_URL ?? '/api/community',
]

let warmed = false

export function warmUpBackend(): void {
  if (warmed || typeof fetch === `undefined`) return
  warmed = true
  for (const base of bases) {
    // `no-cors` vì ta không cần đọc phản hồi — chỉ cần request chạm tới service
    // để Railway đánh thức nó. Nhờ vậy ping không phụ thuộc cấu hình CORS.
    void fetch(`${base}/health`, { mode: 'no-cors', cache: 'no-store' }).catch(() => {})
  }
}