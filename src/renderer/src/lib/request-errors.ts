type RequestErrorDetails = {
  message: string | null
  statusCode: number | null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function sanitizeMessage(value: string): string | null {
  const trimmed = value.trim()
  if (trimmed.length === 0) {
    return null
  }

  if (
    (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
    (trimmed.startsWith('[') && trimmed.endsWith(']'))
  ) {
    try {
      return extractRequestErrorDetails(JSON.parse(trimmed)).message
    } catch {
      // Fall through to first-line cleanup below.
    }
  }

  const firstLine = trimmed
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.length > 0)

  if (!firstLine) {
    return null
  }

  return firstLine.replace(/^(?:Error|TypeError|ReferenceError):\s*/, '').trim() || null
}

function readStatusCode(record: Record<string, unknown>): number | null {
  const directStatusCode =
    typeof record.statusCode === 'number'
      ? record.statusCode
      : typeof record.status === 'number'
        ? record.status
        : null
  if (directStatusCode !== null && Number.isFinite(directStatusCode)) {
    return directStatusCode
  }

  if (isRecord(record.response)) {
    return readStatusCode(record.response)
  }

  if (isRecord(record.data)) {
    return readStatusCode(record.data)
  }

  return null
}

function extractMessage(record: Record<string, unknown>, depth: number): string | null {
  if (depth > 4) {
    return null
  }

  const candidatePaths: unknown[] = [
    record.data,
    record.error,
    record.message,
    record.body,
    record.cause,
    record.response
  ]

  for (const candidate of candidatePaths) {
    const candidateDetails = extractRequestErrorDetails(candidate, depth + 1)
    if (candidateDetails.message) {
      return candidateDetails.message
    }
  }

  return null
}

export function extractRequestErrorDetails(
  error: unknown,
  depth = 0
): RequestErrorDetails {
  if (depth > 4) {
    return {
      message: null,
      statusCode: null
    }
  }

  if (typeof error === 'string') {
    return {
      message: sanitizeMessage(error),
      statusCode: null
    }
  }

  if (error instanceof Error) {
    const record = error as Error & Record<string, unknown>
    const nestedDetails = extractRequestErrorDetails(
      {
        message: error.message,
        data: record.data,
        error: record.error,
        cause: record.cause,
        response: record.response,
        statusCode: record.statusCode,
        status: record.status
      },
      depth + 1
    )

    return {
      message: nestedDetails.message ?? sanitizeMessage(error.message),
      statusCode: nestedDetails.statusCode
    }
  }

  if (isRecord(error)) {
    return {
      message: extractMessage(error, depth),
      statusCode: readStatusCode(error)
    }
  }

  return {
    message: null,
    statusCode: null
  }
}

export function describeRequestError(error: unknown, fallbackMessage: string): string {
  const details = extractRequestErrorDetails(error)
  const message = details.message ?? fallbackMessage

  if (
    details.statusCode !== null &&
    !message.includes(`status ${details.statusCode}`) &&
    !message.includes(`(${details.statusCode})`)
  ) {
    return `${message} (status ${details.statusCode})`
  }

  return message
}

export function createHttpError(statusCode: number, payload: unknown): Error {
  const fallbackMessage = `Request failed with status ${statusCode}`
  const error = new Error(
    describeRequestError(
      {
        statusCode,
        error: payload
      },
      fallbackMessage
    )
  ) as Error & {
    statusCode?: number
  }
  error.statusCode = statusCode
  return error
}
