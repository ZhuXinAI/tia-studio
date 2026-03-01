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
  return async (context, next) => {
    const bearerToken = extractBearerToken(context.req.header('Authorization'))

    if (bearerToken !== token) {
      return context.json({ error: 'Unauthorized' }, 401)
    }

    return next()
  }
}
