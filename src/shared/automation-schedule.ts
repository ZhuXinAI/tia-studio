type ParsedAutomationRRule = {
  normalizedRule: string
  frequency: string | null
  byHour: number | null
  byMinute: number | null
  byDay: string[]
}

export type AutomationScheduleDetails = {
  summary: string
  nextRunAt: string | null
  normalizedRule: string | null
  isImportedRule: boolean
}

const weekdayLabels: Record<string, string> = {
  MO: 'Monday',
  TU: 'Tuesday',
  WE: 'Wednesday',
  TH: 'Thursday',
  FR: 'Friday',
  SA: 'Saturday',
  SU: 'Sunday'
}

const weekdayNumbers: Record<string, number> = {
  SU: 0,
  MO: 1,
  TU: 2,
  WE: 3,
  TH: 4,
  FR: 5,
  SA: 6
}

function parseInteger(value: string | undefined): number | null {
  if (!value) {
    return null
  }

  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < 0) {
    return null
  }

  return parsed
}

function normalizeRRule(rrule: string): string {
  return rrule.startsWith('RRULE:') ? rrule.slice('RRULE:'.length) : rrule
}

function parseAutomationRRule(rrule: string): ParsedAutomationRRule {
  const normalizedRule = normalizeRRule(rrule)
  const parts = new Map(
    normalizedRule.split(';').map((segment) => {
      const [key, value] = segment.split('=')
      return [key?.trim() ?? '', value?.trim() ?? '']
    })
  )

  return {
    normalizedRule,
    frequency: parts.get('FREQ') || null,
    byHour: parseInteger(parts.get('BYHOUR')),
    byMinute: parseInteger(parts.get('BYMINUTE')),
    byDay:
      parts
        .get('BYDAY')
        ?.split(',')
        .map((value) => value.trim().toUpperCase())
        .filter((value) => value.length > 0) ?? []
  }
}

function formatTime(byHour: number | null, byMinute: number | null): string | null {
  if (byHour === null || byMinute === null) {
    return null
  }

  return `${byHour.toString().padStart(2, '0')}:${byMinute.toString().padStart(2, '0')}`
}

function buildCandidate(baseDate: Date, hour: number | null, minute: number | null): Date {
  return new Date(
    baseDate.getFullYear(),
    baseDate.getMonth(),
    baseDate.getDate(),
    hour ?? 0,
    minute ?? 0,
    0,
    0
  )
}

function resolveNextWeeklyRun(parsed: ParsedAutomationRRule, now: Date): Date | null {
  if (parsed.byDay.length === 0) {
    return null
  }

  const candidates = parsed.byDay
    .map((token) => {
      const targetWeekday = weekdayNumbers[token]
      if (targetWeekday === undefined) {
        return null
      }

      const candidate = buildCandidate(now, parsed.byHour, parsed.byMinute)
      const dayOffset = (targetWeekday - now.getDay() + 7) % 7
      candidate.setDate(candidate.getDate() + dayOffset)
      if (candidate <= now) {
        candidate.setDate(candidate.getDate() + 7)
      }
      return candidate
    })
    .filter((candidate): candidate is Date => candidate !== null)
    .sort((left, right) => left.getTime() - right.getTime())

  return candidates[0] ?? null
}

function resolveNextDailyRun(parsed: ParsedAutomationRRule, now: Date): Date | null {
  const candidate = buildCandidate(now, parsed.byHour, parsed.byMinute)
  if (candidate <= now) {
    candidate.setDate(candidate.getDate() + 1)
  }
  return candidate
}

function resolveNextHourlyRun(parsed: ParsedAutomationRRule, now: Date): Date | null {
  if (parsed.byMinute === null) {
    return null
  }

  const candidate = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    now.getHours(),
    parsed.byMinute,
    0,
    0
  )

  if (candidate <= now) {
    candidate.setHours(candidate.getHours() + 1)
  }

  return candidate
}

function resolveNextRun(parsed: ParsedAutomationRRule, now: Date): Date | null {
  switch (parsed.frequency) {
    case 'WEEKLY':
      return resolveNextWeeklyRun(parsed, now)
    case 'DAILY':
      return resolveNextDailyRun(parsed, now)
    case 'HOURLY':
      return resolveNextHourlyRun(parsed, now)
    default:
      return null
  }
}

function formatSummary(parsed: ParsedAutomationRRule, rawRule: string): string {
  const timeLabel = formatTime(parsed.byHour, parsed.byMinute)

  if (parsed.frequency === 'WEEKLY' && parsed.byDay.length > 0) {
    const dayLabel = parsed.byDay.map((token) => weekdayLabels[token] ?? token).join(', ')
    return timeLabel ? `Every ${dayLabel} at ${timeLabel}` : `Every ${dayLabel}`
  }

  if (parsed.frequency === 'DAILY') {
    return timeLabel ? `Every day at ${timeLabel}` : 'Every day'
  }

  if (parsed.frequency === 'HOURLY') {
    if (parsed.byMinute !== null) {
      return `Every hour at :${parsed.byMinute.toString().padStart(2, '0')}`
    }

    return 'Hourly'
  }

  return rawRule
}

export function describeAutomationSchedule(
  rrule: string | null,
  now = new Date()
): AutomationScheduleDetails {
  if (!rrule) {
    return {
      summary: 'No saved schedule',
      nextRunAt: null,
      normalizedRule: null,
      isImportedRule: false
    }
  }

  const parsed = parseAutomationRRule(rrule)
  const nextRun = resolveNextRun(parsed, now)

  return {
    summary: formatSummary(parsed, rrule),
    nextRunAt: nextRun ? nextRun.toISOString() : null,
    normalizedRule: parsed.normalizedRule,
    isImportedRule: true
  }
}
