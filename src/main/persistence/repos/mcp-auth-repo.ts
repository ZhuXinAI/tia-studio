import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import path from 'node:path'
import type {
  OAuthAuthorizationServerInformation,
  OAuthClientInformation,
  OAuthTokens
} from '@ai-sdk/mcp'

const MCP_AUTH_VERSION = 1

export type McpOAuthState = {
  serverUrl?: string
  tokens?: OAuthTokens
  codeVerifier?: string
  state?: string
  clientInformation?: OAuthClientInformation
  authorizationServerInformation?: OAuthAuthorizationServerInformation
  redirectUrl?: string
}

type McpAuthSettings = {
  version: typeof MCP_AUTH_VERSION
  servers: Record<string, McpOAuthState>
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function httpUrl(value: unknown): string | undefined {
  const candidate = nonEmptyString(value)
  if (!candidate) return undefined
  try {
    const url = new URL(candidate)
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : undefined
  } catch {
    return undefined
  }
}

function loopbackRedirectUrl(value: unknown): string | undefined {
  const candidate = httpUrl(value)
  if (!candidate) return undefined
  const url = new URL(candidate)
  return url.protocol === 'http:' && url.hostname === '127.0.0.1' ? url.href : undefined
}

function normalizeTokens(value: unknown): OAuthTokens | undefined {
  if (!isRecord(value)) return undefined
  const accessToken = nonEmptyString(value.access_token)
  const tokenType = nonEmptyString(value.token_type)
  if (!accessToken || !tokenType) return undefined

  const tokens: OAuthTokens = { access_token: accessToken, token_type: tokenType }
  const idToken = nonEmptyString(value.id_token)
  const refreshToken = nonEmptyString(value.refresh_token)
  const scope = nonEmptyString(value.scope)
  const authorizationServer = httpUrl(value.authorization_server)
  const tokenEndpoint = httpUrl(value.token_endpoint)
  if (idToken) tokens.id_token = idToken
  if (refreshToken) tokens.refresh_token = refreshToken
  if (scope) tokens.scope = scope
  if (typeof value.expires_in === 'number' && Number.isFinite(value.expires_in)) {
    tokens.expires_in = value.expires_in
  }
  if (authorizationServer) tokens.authorization_server = authorizationServer
  if (tokenEndpoint) tokens.token_endpoint = tokenEndpoint
  return tokens
}

function normalizeClientInformation(value: unknown): OAuthClientInformation | undefined {
  if (!isRecord(value)) return undefined
  const clientId = nonEmptyString(value.client_id)
  if (!clientId) return undefined

  const clientInformation: OAuthClientInformation = { client_id: clientId }
  const clientSecret = nonEmptyString(value.client_secret)
  const authorizationServer = httpUrl(value.authorization_server)
  const tokenEndpoint = httpUrl(value.token_endpoint)
  if (clientSecret) clientInformation.client_secret = clientSecret
  if (typeof value.client_id_issued_at === 'number' && Number.isFinite(value.client_id_issued_at)) {
    clientInformation.client_id_issued_at = value.client_id_issued_at
  }
  if (
    typeof value.client_secret_expires_at === 'number' &&
    Number.isFinite(value.client_secret_expires_at)
  ) {
    clientInformation.client_secret_expires_at = value.client_secret_expires_at
  }
  if (authorizationServer) clientInformation.authorization_server = authorizationServer
  if (tokenEndpoint) clientInformation.token_endpoint = tokenEndpoint
  return clientInformation
}

function normalizeAuthorizationServerInformation(
  value: unknown
): OAuthAuthorizationServerInformation | undefined {
  if (!isRecord(value)) return undefined
  const authorizationServerUrl = httpUrl(value.authorizationServerUrl)
  const tokenEndpoint = httpUrl(value.tokenEndpoint)
  if (!authorizationServerUrl || !tokenEndpoint) return undefined
  return { authorizationServerUrl, tokenEndpoint }
}

export function normalizeMcpOAuthState(value: unknown): McpOAuthState | undefined {
  if (!isRecord(value)) return undefined
  const state: McpOAuthState = {}
  const serverUrl = httpUrl(value.serverUrl)
  const tokens = normalizeTokens(value.tokens)
  const codeVerifier = nonEmptyString(value.codeVerifier)
  const callbackState = nonEmptyString(value.state)
  const clientInformation = normalizeClientInformation(value.clientInformation)
  const authorizationServerInformation = normalizeAuthorizationServerInformation(
    value.authorizationServerInformation
  )
  const redirectUrl = loopbackRedirectUrl(value.redirectUrl)

  if (serverUrl) state.serverUrl = serverUrl
  if (tokens) state.tokens = tokens
  if (codeVerifier) state.codeVerifier = codeVerifier
  if (callbackState) state.state = callbackState
  if (clientInformation) state.clientInformation = clientInformation
  if (authorizationServerInformation)
    state.authorizationServerInformation = authorizationServerInformation
  if (redirectUrl) state.redirectUrl = redirectUrl
  return Object.keys(state).length > 0 ? state : undefined
}

function normalizeSettings(value: unknown): McpAuthSettings | undefined {
  if (!isRecord(value) || value.version !== MCP_AUTH_VERSION || !isRecord(value.servers)) {
    return undefined
  }

  const servers: Record<string, McpOAuthState> = {}
  for (const [rawServerId, rawState] of Object.entries(value.servers)) {
    const serverId = rawServerId.trim()
    const state = normalizeMcpOAuthState(rawState)
    if (!serverId || !state) return undefined
    servers[serverId] = state
  }
  return { version: MCP_AUTH_VERSION, servers }
}

function emptySettings(): McpAuthSettings {
  return { version: MCP_AUTH_VERSION, servers: {} }
}

export function defaultMcpAuthPath(): string {
  return path.join(homedir(), '.tia-studio', 'mcp-auth.json')
}

export type McpOAuthAuthStatus = 'signed-in' | 'sign-in-incomplete' | 'not-signed-in'

export function mcpOAuthAuthStatus(state: McpOAuthState | undefined): McpOAuthAuthStatus {
  if (state?.tokens?.access_token) return 'signed-in'
  if (state?.clientInformation || state?.codeVerifier || state?.state) return 'sign-in-incomplete'
  return 'not-signed-in'
}

/**
 * Stores OAuth tokens, dynamic-client registrations, and PKCE state separately from
 * regular MCP settings. The file is intentionally never exposed by the local API.
 */
export class McpAuthRepository {
  constructor(private readonly filePath = defaultMcpAuthPath()) {}

  async getState(serverId: string): Promise<McpOAuthState | undefined> {
    return (await this.loadSettings()).servers[serverId.trim()]
  }

  async getStatus(serverId: string): Promise<McpOAuthAuthStatus> {
    return mcpOAuthAuthStatus(await this.getState(serverId))
  }

  async updateState(
    rawServerId: string,
    update: (current: McpOAuthState | undefined) => McpOAuthState | undefined
  ): Promise<McpOAuthState | undefined> {
    const serverId = rawServerId.trim()
    if (!serverId) throw new Error('MCP server id is required')

    const settings = await this.loadSettings()
    const next = normalizeMcpOAuthState(update(settings.servers[serverId]))
    if (next) settings.servers[serverId] = next
    else delete settings.servers[serverId]
    await this.saveSettings(settings)
    return next
  }

  async clearState(serverId: string): Promise<void> {
    await this.updateState(serverId, () => undefined)
  }

  async retain(serverIds: Iterable<string>): Promise<void> {
    const knownServerIds = new Set(
      [...serverIds].map((serverId) => serverId.trim()).filter((serverId) => serverId.length > 0)
    )
    const settings = await this.loadSettings()
    const staleServerIds = Object.keys(settings.servers).filter(
      (serverId) => !knownServerIds.has(serverId)
    )
    if (staleServerIds.length === 0) return
    for (const serverId of staleServerIds) delete settings.servers[serverId]
    await this.saveSettings(settings)
  }

  private async loadSettings(): Promise<McpAuthSettings> {
    try {
      const raw = await readFile(this.filePath, 'utf-8')
      const settings = normalizeSettings(JSON.parse(raw) as unknown)
      if (!settings) throw new Error('invalid MCP authentication state')
      return settings
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return emptySettings()
      throw new Error('MCP authentication state could not be read')
    }
  }

  private async saveSettings(settings: McpAuthSettings): Promise<void> {
    const normalized = normalizeSettings(settings)
    if (!normalized) throw new Error('MCP authentication state is invalid')

    const directory = path.dirname(this.filePath)
    await mkdir(directory, { recursive: true, mode: 0o700 })
    await chmod(directory, 0o700).catch(() => undefined)
    await writeFile(this.filePath, `${JSON.stringify(normalized, null, 2)}\n`, {
      encoding: 'utf-8',
      mode: 0o600
    })
    await chmod(this.filePath, 0o600).catch(() => undefined)
  }
}
