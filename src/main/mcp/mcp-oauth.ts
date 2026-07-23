import { randomBytes } from 'node:crypto'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import {
  auth,
  type OAuthAuthorizationServerInformation,
  type OAuthClientInformation,
  type OAuthClientMetadata,
  type OAuthClientProvider,
  type OAuthTokens
} from '@ai-sdk/mcp'
import type { AppMcpServer } from '../persistence/repos/mcp-servers-repo'
import { type McpAuthRepository, type McpOAuthState } from '../persistence/repos/mcp-auth-repo'

const CALLBACK_PATH = '/oauth/callback'
const OAUTH_CALLBACK_TIMEOUT_MS = 5 * 60_000
const MAX_AUTHORIZATION_REDIRECTS = 3
export const MCP_OAUTH_REAUTH_REDIRECT_URL = 'http://127.0.0.1:0/oauth/callback'

type OAuthCallback = { code: string; state?: string } | { error: string; errorDescription?: string }

type PendingCallback = {
  resolve: (callback: OAuthCallback) => void
  reject: (error: Error) => void
  timeout: ReturnType<typeof setTimeout>
}

type OAuthCallbackServer = {
  redirectUrl: string
  redirectUrlChanged: boolean
  waitForCallback: () => Promise<OAuthCallback>
  close: () => Promise<void>
}

export type McpOAuthProviderOptions = {
  serverId: string
  redirectUrl: string
  authRepository: McpAuthRepository
  onAuthorizationUrl: (url: URL) => Promise<void> | void
}

export type McpOAuthServiceOptions = {
  openAuthorizationUrl: (url: URL) => Promise<void> | void
}

const clientMetadata = (redirectUrl: string): OAuthClientMetadata => ({
  redirect_uris: [redirectUrl],
  token_endpoint_auth_method: 'none',
  grant_types: ['authorization_code', 'refresh_token'],
  response_types: ['code'],
  client_name: 'TIA Studio'
})

function messageFromUnknown(error: unknown): string {
  return error instanceof Error && error.message ? error.message : 'The operation failed'
}

function isLoopbackHost(hostname: string): boolean {
  return (
    hostname === '127.0.0.1' ||
    hostname === 'localhost' ||
    hostname === '::1' ||
    hostname === '[::1]'
  )
}

function isSafeOAuthUrl(url: URL): boolean {
  return url.protocol === 'https:' || (url.protocol === 'http:' && isLoopbackHost(url.hostname))
}

function parsePreferredCallbackPort(value: string | undefined): number | undefined {
  if (!value) return undefined
  try {
    const url = new URL(value)
    if (
      url.protocol !== 'http:' ||
      url.hostname !== '127.0.0.1' ||
      url.pathname !== CALLBACK_PATH ||
      !url.port
    ) {
      return undefined
    }
    const port = Number(url.port)
    return Number.isInteger(port) && port > 0 && port <= 65_535 ? port : undefined
  } catch {
    return undefined
  }
}

function respondToCallback(response: ServerResponse, success: boolean): void {
  response.statusCode = success ? 200 : 400
  response.setHeader('content-type', 'text/html; charset=utf-8')
  response.end(
    `<!doctype html><html><body><p>${
      success
        ? 'Sign-in complete. You can return to TIA Studio.'
        : 'Sign-in could not be completed.'
    }</p></body></html>`
  )
}

async function closeServer(server: Server): Promise<void> {
  await new Promise<void>((resolve) => {
    try {
      server.close(() => resolve())
      server.closeAllConnections()
    } catch {
      resolve()
    }
  })
}

async function listen(server: Server, port: number): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const onError = (error: Error) => {
      server.off('listening', onListening)
      reject(error)
    }
    const onListening = () => {
      server.off('error', onError)
      resolve()
    }
    server.once('error', onError)
    server.once('listening', onListening)
    server.listen(port, '127.0.0.1')
  })
}

async function startOAuthCallbackServer(
  preferredRedirectUrl: string | undefined
): Promise<OAuthCallbackServer> {
  const callbacks: OAuthCallback[] = []
  let pending: PendingCallback | undefined

  const deliver = (callback: OAuthCallback): void => {
    if (!pending) {
      callbacks.push(callback)
      return
    }
    clearTimeout(pending.timeout)
    const current = pending
    pending = undefined
    current.resolve(callback)
  }

  const requestListener = (request: IncomingMessage, response: ServerResponse): void => {
    if (request.method !== 'GET') {
      response.statusCode = 405
      response.end()
      return
    }

    const callbackUrl = new URL(request.url ?? '/', 'http://127.0.0.1')
    if (callbackUrl.pathname !== CALLBACK_PATH) {
      response.statusCode = 404
      response.end()
      return
    }

    const error = callbackUrl.searchParams.get('error')
    if (error) {
      respondToCallback(response, false)
      deliver({
        error,
        ...(callbackUrl.searchParams.get('error_description')
          ? { errorDescription: callbackUrl.searchParams.get('error_description')! }
          : {})
      })
      return
    }

    const code = callbackUrl.searchParams.get('code')
    if (!code) {
      respondToCallback(response, false)
      deliver({ error: 'missing_authorization_code' })
      return
    }

    respondToCallback(response, true)
    deliver({
      code,
      ...(callbackUrl.searchParams.get('state')
        ? { state: callbackUrl.searchParams.get('state')! }
        : {})
    })
  }

  const server = createServer(requestListener)
  const preferredPort = parsePreferredCallbackPort(preferredRedirectUrl)
  let redirectUrlChanged = !preferredPort
  if (preferredPort) {
    try {
      await listen(server, preferredPort)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EADDRINUSE') {
        await closeServer(server)
        throw error
      }
      redirectUrlChanged = true
      await listen(server, 0)
    }
  } else {
    await listen(server, 0)
  }

  const address = server.address()
  if (!address || typeof address === 'string') {
    await closeServer(server)
    throw new Error('TIA Studio could not start the local OAuth callback server')
  }
  const redirectUrl = `http://127.0.0.1:${address.port}${CALLBACK_PATH}`
  redirectUrlChanged ||= redirectUrl !== preferredRedirectUrl

  return {
    redirectUrl,
    redirectUrlChanged,
    waitForCallback: () => {
      const callback = callbacks.shift()
      if (callback) return Promise.resolve(callback)
      return new Promise<OAuthCallback>((resolve, reject) => {
        const timeout = setTimeout(() => {
          if (!pending) return
          pending = undefined
          reject(new Error('OAuth sign-in timed out. Try signing in again when you are ready.'))
        }, OAUTH_CALLBACK_TIMEOUT_MS)
        pending = { resolve, reject, timeout }
      })
    },
    close: async () => {
      if (pending) {
        clearTimeout(pending.timeout)
        const current = pending
        pending = undefined
        current.reject(new Error('OAuth sign-in was closed'))
      }
      await closeServer(server)
    }
  }
}

function withoutTransientState(state: McpOAuthState): McpOAuthState {
  const stable = { ...state }
  delete stable.codeVerifier
  delete stable.state
  return stable
}

function clearCredentials(
  state: McpOAuthState | undefined,
  scope: 'all' | 'client' | 'tokens' | 'verifier'
): McpOAuthState | undefined {
  if (!state || scope === 'all') return undefined
  const next = { ...state }
  if (scope === 'client') {
    delete next.clientInformation
    delete next.authorizationServerInformation
    delete next.tokens
  }
  if (scope === 'tokens') delete next.tokens
  if (scope === 'verifier') {
    delete next.codeVerifier
    delete next.state
  }
  return Object.keys(next).length > 0 ? next : undefined
}

export function remoteMcpTransport(server: AppMcpServer): 'http' | 'sse' | undefined {
  const type = server.type.trim().toLowerCase()
  if ((type !== 'http' && type !== 'sse') || !server.url) return undefined
  try {
    const url = new URL(server.url)
    return url.protocol === 'http:' || url.protocol === 'https:' ? type : undefined
  } catch {
    return undefined
  }
}

export function createMcpOAuthProvider({
  serverId,
  redirectUrl,
  authRepository,
  onAuthorizationUrl
}: McpOAuthProviderOptions): OAuthClientProvider {
  const stateFor = async (): Promise<McpOAuthState | undefined> => authRepository.getState(serverId)
  const updateState = async (
    update: (current: McpOAuthState | undefined) => McpOAuthState | undefined
  ): Promise<void> => {
    await authRepository.updateState(serverId, update)
  }

  return {
    tokens: async (): Promise<OAuthTokens | undefined> => (await stateFor())?.tokens,
    saveTokens: async (tokens: OAuthTokens) => {
      await updateState((current) => withoutTransientState({ ...(current ?? {}), tokens }))
    },
    redirectToAuthorization: async (authorizationUrl: URL) => onAuthorizationUrl(authorizationUrl),
    saveCodeVerifier: async (codeVerifier: string) => {
      await updateState((current) => ({ ...(current ?? {}), codeVerifier }))
    },
    codeVerifier: async () => {
      const codeVerifier = (await stateFor())?.codeVerifier
      if (!codeVerifier) throw new Error('No OAuth sign-in is waiting for an authorization code')
      return codeVerifier
    },
    get redirectUrl() {
      return redirectUrl
    },
    get clientMetadata() {
      return clientMetadata(redirectUrl)
    },
    clientInformation: async (): Promise<OAuthClientInformation | undefined> =>
      (await stateFor())?.clientInformation,
    saveClientInformation: async (clientInformation: OAuthClientInformation) => {
      await updateState((current) => ({ ...(current ?? {}), clientInformation }))
    },
    authorizationServerInformation: async (): Promise<
      OAuthAuthorizationServerInformation | undefined
    > => (await stateFor())?.authorizationServerInformation,
    saveAuthorizationServerInformation: async (
      authorizationServerInformation: OAuthAuthorizationServerInformation
    ) => {
      await updateState((current) => ({ ...(current ?? {}), authorizationServerInformation }))
    },
    validateAuthorizationServerURL: async (serverUrl, authorizationServerUrl) => {
      const resourceUrl = new URL(serverUrl.toString())
      const authorizationUrl = new URL(authorizationServerUrl.toString())
      if (!isSafeOAuthUrl(resourceUrl)) {
        throw new Error('MCP OAuth requires an HTTPS server URL or a local loopback URL')
      }
      if (!isSafeOAuthUrl(authorizationUrl)) {
        throw new Error('MCP OAuth requires an HTTPS authorization server or a local loopback URL')
      }
    },
    state: () => randomBytes(32).toString('base64url'),
    saveState: async (state: string) => {
      await updateState((current) => ({ ...(current ?? {}), state }))
    },
    storedState: async (): Promise<string | undefined> => (await stateFor())?.state,
    invalidateCredentials: async (scope) => {
      await updateState((current) => clearCredentials(current, scope))
    }
  }
}

function isOAuthCallbackError(
  callback: OAuthCallback
): callback is Extract<OAuthCallback, { error: string }> {
  return 'error' in callback
}

export class McpOAuthService {
  constructor(
    private readonly authRepository: McpAuthRepository,
    private readonly options: McpOAuthServiceOptions
  ) {}

  async getStatus(serverId: string) {
    return this.authRepository.getStatus(serverId)
  }

  async logout(serverId: string): Promise<void> {
    await this.authRepository.clearState(serverId)
  }

  async login(serverId: string, server: AppMcpServer): Promise<void> {
    const transport = remoteMcpTransport(server)
    if (!transport || !server.url) {
      throw new Error(
        `"${server.name}" is not an HTTP or SSE MCP server and does not support browser OAuth`
      )
    }

    const serverUrl = new URL(server.url).href
    const previousState = await this.authRepository.getState(serverId)
    const callbackServer = await startOAuthCallbackServer(
      previousState?.serverUrl === serverUrl ? previousState.redirectUrl : undefined
    )
    try {
      await this.authRepository.updateState(serverId, (current) => {
        const currentForServer = current?.serverUrl === serverUrl ? current : undefined
        return callbackServer.redirectUrlChanged
          ? { serverUrl, redirectUrl: callbackServer.redirectUrl }
          : { ...(currentForServer ?? {}), serverUrl, redirectUrl: callbackServer.redirectUrl }
      })

      const provider = createMcpOAuthProvider({
        serverId,
        redirectUrl: callbackServer.redirectUrl,
        authRepository: this.authRepository,
        onAuthorizationUrl: this.options.openAuthorizationUrl
      })

      let result = await auth(provider, { serverUrl: server.url })
      let redirects = 0
      while (result === 'REDIRECT') {
        redirects += 1
        if (redirects > MAX_AUTHORIZATION_REDIRECTS) {
          throw new Error('OAuth sign-in redirected too many times. Try signing in again.')
        }
        const callback = await callbackServer.waitForCallback()
        if (isOAuthCallbackError(callback)) {
          const detail = callback.errorDescription ? `: ${callback.errorDescription}` : ''
          throw new Error(`OAuth sign-in was not completed (${callback.error})${detail}`)
        }
        result = await auth(provider, {
          serverUrl: server.url,
          authorizationCode: callback.code,
          callbackState: callback.state
        })
      }
    } catch (error) {
      throw new Error(`Could not sign in to "${server.name}": ${messageFromUnknown(error)}`)
    } finally {
      await callbackServer.close()
    }
  }
}
