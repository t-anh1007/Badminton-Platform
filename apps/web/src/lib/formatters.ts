const VIETNAM_TIME_ZONE = 'Asia/Ho_Chi_Minh'

const dateFormatter = new Intl.DateTimeFormat('vi-VN', {
  timeZone: VIETNAM_TIME_ZONE,
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
})

const timeFormatter = new Intl.DateTimeFormat('vi-VN', {
  timeZone: VIETNAM_TIME_ZONE,
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
})

const numberFormatter = new Intl.NumberFormat('vi-VN')

function asDate(value: Date | string) {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) throw new TypeError('Giá trị ngày giờ không hợp lệ.')
  return date
}

export function formatDateVi(value: Date | string) {
  return dateFormatter.format(asDate(value))
}

export function formatDateTimeVi(value: Date | string) {
  const date = asDate(value)
  return `${dateFormatter.format(date)} ${timeFormatter.format(date)}`
}

export function formatTimeVi(value: Date | string) {
  return timeFormatter.format(asDate(value))
}

/** Định dạng tiền VND thống nhất toàn app: "180.000đ" — số theo dấu chấm phân
 * cách nghìn kiểu vi-VN, hậu tố "đ" liền số (quy ước phổ biến trong UI Việt,
 * không dùng ký hiệu "₫" của Intl để tránh hiển thị lẫn lộn hai kiểu). */
export function formatMoneyVnd(value: string | bigint | number) {
  const amount = typeof value === 'bigint' || typeof value === 'number' ? value : BigInt(value)
  return `${numberFormatter.format(amount)}đ`
}

export function formatDuration(minutes: number) {
  if (!Number.isInteger(minutes) || minutes < 0) throw new RangeError('Thời lượng phải là số phút không âm.')
  const hours = Math.floor(minutes / 60)
  const remainder = minutes % 60
  if (hours === 0) return `${remainder} phút`
  if (remainder === 0) return `${hours} giờ`
  return `${hours} giờ ${remainder} phút`
}

export function parseDateFieldVi(value: string): string | null {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value.trim())
  if (!match) return null
  const [, day, month, year] = match
  const date = new Date(`${year}-${month}-${day}T00:00:00.000Z`)
  if (date.getUTCFullYear() !== Number(year) || date.getUTCMonth() + 1 !== Number(month) || date.getUTCDate() !== Number(day)) return null
  return `${year}-${month}-${day}`
}
