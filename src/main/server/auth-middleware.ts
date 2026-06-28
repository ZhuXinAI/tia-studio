import type { MiddlewareHandler } from 'hono'

function extractBearerToken(headerValue?: string | null): string | null {
  if (!headerValue) {
    return null
  }

  const [scheme, token] = headerValue.split(' ')
  if (scheme !== 'Bearer' || !token) {
    return null
  }

  return token
}

export function createBearerAuthMiddleware(token: string): MiddlewareHandler {
  return createBearerAuthMiddlewareWithOptions(token, {})
}

type BearerAuthMiddlewareOptions = {
  allowUnauthenticatedOrigins?: string[]
}

function isAllowedOrigin(origin: string | null | undefined, allowedOrigins: string[]): boolean {
  return Boolean(origin && allowedOrigins.includes(origin))
}

export function createBearerAuthMiddlewareWithOptions(
  token: string,
  options: BearerAuthMiddlewareOptions
): MiddlewareHandler {
  const allowedOrigins = options.allowUnauthenticatedOrigins ?? []

  return async (context, next) => {
    const bearerToken = extractBearerToken(context.req.header('Authorization'))

    if (bearerToken !== token && !isAllowedOrigin(context.req.header('Origin'), allowedOrigins)) {
      return context.json({ error: 'Unauthorized' }, 401)
    }

    return next()
  }
}
