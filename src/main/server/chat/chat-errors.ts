export class ChatRouteError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string
  ) {
    super(message)
    this.name = 'ChatRouteError'
  }
}

export function isChatRouteError(error: unknown): error is ChatRouteError {
  return error instanceof ChatRouteError
}
