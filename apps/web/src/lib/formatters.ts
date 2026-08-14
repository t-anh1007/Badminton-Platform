const VIETNAM_TIME_ZONE = 'Asia/Ho_Chi_Minh'

const dateFormatter = new Intl.DateTimeFormat('vi-VN', {
  timeZone: VIETNAM_TIME_ZONE,
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
})

const dateTimeFormatter = new Intl.DateTimeFormat('vi-VN', {
  timeZone: VIETNAM_TIME_ZONE,
  hour: '2-digit',
  minute: '2-digit',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour12: false,
})

const moneyFormatter = new Intl.NumberFormat('vi-VN', {
  style: 'currency',
  currency: 'VND',
})

function asDate(value: Date | string) {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) throw new TypeError('Giá trị ngày giờ không hợp lệ.')
  return date
}

export function formatDateVi(value: Date | string) {
  return dateFormatter.format(asDate(value))
}

export function formatDateTimeVi(value: Date | string) {
  return dateTimeFormatter.format(asDate(value)).replace(', ', ' ')
}

export function formatMoneyVnd(value: string | bigint) {
  return moneyFormatter.format(typeof value === 'bigint' ? value : BigInt(value))
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
