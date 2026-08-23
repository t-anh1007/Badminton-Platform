export const VIETNAM_OFFSET_MINUTES = 7 * 60;

function shiftedToVietnam(value: Date): Date {
  return new Date(value.getTime() + VIETNAM_OFFSET_MINUTES * 60_000);
}

/** Date-only API values use midnight UTC as an identifier for a Vietnam date. */
export function vietnamDateStartInstant(date: Date): Date {
  const identifier = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  return new Date(identifier.getTime() - VIETNAM_OFFSET_MINUTES * 60_000);
}

export function vietnamDateEndExclusiveInstant(date: Date): Date {
  return new Date(vietnamDateStartInstant(date).getTime() + 24 * 60 * 60_000);
}

export function vietnamMinuteToInstant(date: Date, minute: number): Date {
  return new Date(vietnamDateStartInstant(date).getTime() + minute * 60_000);
}

export function vietnamMinuteOfDay(value: Date): number {
  const vietnam = shiftedToVietnam(value);
  return vietnam.getUTCHours() * 60 + vietnam.getUTCMinutes();
}

export function vietnamWeekday(value: Date): number {
  return shiftedToVietnam(value).getUTCDay();
}

/** Midnight UTC identifier used by the Closure.date date-only column. */
export function vietnamDateIdentifier(value: Date): Date {
  const vietnam = shiftedToVietnam(value);
  return new Date(Date.UTC(vietnam.getUTCFullYear(), vietnam.getUTCMonth(), vietnam.getUTCDate()));
}
