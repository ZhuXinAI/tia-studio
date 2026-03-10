const MINUTES_PER_DAY = 24 * 60
const MAX_LOOKAHEAD_MINUTES = 366 * MINUTES_PER_DAY

type CronField = {
  wildcard: boolean
  values: Set<number>
}

type ParsedCronExpression = {
  minute: CronField
  hour: CronField
  dayOfMonth: CronField
  month: CronField
  dayOfWeek: CronField
}

type CronFieldRange = {
  min: number
  max: number
  allowSevenAsSunday?: boolean
}

function normalizeCronValue(value: number, range: CronFieldRange): number {
  if (range.allowSevenAsSunday && value === 7) {
    return 0
  }

  return value
}

function parseSingleValue(token: string, range: CronFieldRange): number {
  if (!/^\d+$/.test(token)) {
    throw new Error(`Invalid cron token: ${token}`)
  }

  const value = Number(token)
  const normalizedValue = normalizeCronValue(value, range)
  if (normalizedValue < range.min || normalizedValue > range.max) {
    throw new Error(`Cron value out of range: ${token}`)
  }

  return normalizedValue
}

function parseRangeToken(token: string, range: CronFieldRange): readonly [number, number] {
  if (token === '*') {
    return [range.min, range.max]
  }

  if (!token.includes('-')) {
    const value = parseSingleValue(token, range)
    return [value, range.max]
  }

  const [startToken, endToken] = token.split('-')
  if (!startToken || !endToken) {
    throw new Error(`Invalid cron range: ${token}`)
  }

  const start = parseSingleValue(startToken, range)
  const end = parseSingleValue(endToken, range)
  if (end < start) {
    throw new Error(`Invalid cron range: ${token}`)
  }

  return [start, end]
}

function parseField(token: string, range: CronFieldRange): CronField {
  if (token.trim().length === 0) {
    throw new Error('Empty cron field')
  }

  if (token === '*') {
    const values = new Set<number>()
    for (let value = range.min; value <= range.max; value += 1) {
      values.add(normalizeCronValue(value, range))
    }

    return {
      wildcard: true,
      values
    }
  }

  const values = new Set<number>()

  for (const part of token.split(',')) {
    if (part.includes('/')) {
      const [baseToken, stepToken] = part.split('/')
      if (!baseToken || !stepToken || !/^\d+$/.test(stepToken)) {
        throw new Error(`Invalid cron step: ${part}`)
      }

      const step = Number(stepToken)
      if (step <= 0) {
        throw new Error(`Invalid cron step: ${part}`)
      }

      const [start, end] = parseRangeToken(baseToken, range)
      for (let value = start; value <= end; value += step) {
        values.add(normalizeCronValue(value, range))
      }
      continue
    }

    if (part.includes('-')) {
      const [start, end] = parseRangeToken(part, range)
      for (let value = start; value <= end; value += 1) {
        values.add(normalizeCronValue(value, range))
      }
      continue
    }

    values.add(parseSingleValue(part, range))
  }

  return {
    wildcard: false,
    values
  }
}

function parseCronExpression(expression: string): ParsedCronExpression {
  const parts = expression.trim().split(/\s+/)
  if (parts.length !== 5) {
    throw new Error('Cron expression must contain five fields')
  }

  const [minute, hour, dayOfMonth, month, dayOfWeek] = parts

  return {
    minute: parseField(minute, { min: 0, max: 59 }),
    hour: parseField(hour, { min: 0, max: 23 }),
    dayOfMonth: parseField(dayOfMonth, { min: 1, max: 31 }),
    month: parseField(month, { min: 1, max: 12 }),
    dayOfWeek: parseField(dayOfWeek, { min: 0, max: 6, allowSevenAsSunday: true })
  }
}

function fieldMatches(field: CronField, value: number): boolean {
  return field.values.has(value)
}

function matchesDay(parsed: ParsedCronExpression, date: Date): boolean {
  const dayOfMonthMatches = fieldMatches(parsed.dayOfMonth, date.getDate())
  const dayOfWeekMatches = fieldMatches(parsed.dayOfWeek, date.getDay())

  if (parsed.dayOfMonth.wildcard && parsed.dayOfWeek.wildcard) {
    return true
  }

  if (parsed.dayOfMonth.wildcard) {
    return dayOfWeekMatches
  }

  if (parsed.dayOfWeek.wildcard) {
    return dayOfMonthMatches
  }

  return dayOfMonthMatches || dayOfWeekMatches
}

function matchesCronExpression(parsed: ParsedCronExpression, date: Date): boolean {
  return (
    fieldMatches(parsed.minute, date.getMinutes()) &&
    fieldMatches(parsed.hour, date.getHours()) &&
    fieldMatches(parsed.month, date.getMonth() + 1) &&
    matchesDay(parsed, date)
  )
}

function nextMinute(date: Date): Date {
  const next = new Date(date.getTime())
  next.setSeconds(0, 0)
  next.setMinutes(next.getMinutes() + 1)
  return next
}

export function isValidCronExpression(expression: string): boolean {
  try {
    parseCronExpression(expression)
    return true
  } catch {
    return false
  }
}

export function getNextCronRunAt(expression: string, from: Date): Date | null {
  let parsed: ParsedCronExpression
  try {
    parsed = parseCronExpression(expression)
  } catch {
    return null
  }

  let candidate = nextMinute(from)
  for (let index = 0; index < MAX_LOOKAHEAD_MINUTES; index += 1) {
    if (matchesCronExpression(parsed, candidate)) {
      return candidate
    }

    candidate = new Date(candidate.getTime() + 60_000)
  }

  return null
}
