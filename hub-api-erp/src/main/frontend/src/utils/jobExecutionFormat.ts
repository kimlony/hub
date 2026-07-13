const KOREA_TIME_ZONE = 'Asia/Seoul'

export function formatJobExecutionDate(value: string | null | undefined): string {
  if (!value) return '-'

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value

  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: KOREA_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(date)
}

export function formatDuration(durationMs: number | null | undefined): string {
  if (durationMs === null || durationMs === undefined) return '-'
  if (durationMs === 0) return '0ms'
  if (durationMs < 1_000) return `${durationMs}ms`

  const seconds = durationMs / 1_000
  if (seconds < 60) return `${formatDecimal(seconds)}초`

  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = Math.round(seconds % 60)
  return remainingSeconds === 0 ? `${minutes}분` : `${minutes}분 ${remainingSeconds}초`
}

export function toDateTimeLocalValue(date: Date): string {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
  return local.toISOString().slice(0, 16)
}

export function toApiDateTime(value: string): string {
  return new Date(value).toISOString()
}

function formatDecimal(value: number): string {
  return value.toFixed(value < 10 ? 1 : 0).replace(/\.0$/, '')
}
