import { once } from 'node:events'
import { mkdtemp, rm } from 'node:fs/promises'
import { createServer } from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createMcpClientTools } from '../agents/pi/mcp-client-tools'
import { McpAuthRepository } from '../persistence/repos/mcp-auth-repo'
import { McpOAuthService } from './mcp-oauth'

function json(response: import('node:http').ServerResponse, body: unknown, status = 200): void {
  response.statusCode = status
  response.setHeader('content-type', 'application/json')
  response.end(JSON.stringify(body))
}

async function readRequestBody(request: import('node:http').IncomingMessage): Promise<string> {
  let body = ''
  for await (const chunk of request) body += chunk
  return body
}

async function startOAuthServer() {
  let origin = ''
  let unauthenticatedMcpRequestCount = 0
  const server = createServer(async (request, response) => {
    const url = new URL(request.url ?? '/', origin)
    if (url.pathname === '/.well-known/oauth-protected-resource') {
      json(response, { resource: `${origin}/mcp`, authorization_servers: [origin] })
      return
    }
    if (url.pathname === '/.well-known/oauth-authorization-server') {
      json(response, {
        issuer: origin,
        authorization_endpoint: `${origin}/authorize`,
        token_endpoint: `${origin}/token`,
        registration_endpoint: `${origin}/register`,
        response_types_supported: ['code'],
        grant_types_supported: ['authorization_code', 'refresh_token'],
        code_challenge_methods_supported: ['S256'],
        token_endpoint_auth_methods_supported: ['none']
      })
      return
    }
    if (url.pathname === '/register' && request.method === 'POST') {
      const registration = JSON.parse(await readRequestBody(request)) as {
        redirect_uris?: string[]
      }
      json(
        response,
        { client_id: 'test-client', redirect_uris: registration.redirect_uris ?? [] },
        201
      )
      return
    }
    if (url.pathname === '/token' && request.method === 'POST') {
      json(response, {
        access_token: 'test-access-token',
        token_type: 'Bearer',
        refresh_token: 'test-refresh-token'
      })
      return
    }
    if (url.pathname === '/mcp' && request.method === 'POST') {
      const message = JSON.parse(await readRequestBody(request)) as {
        id?: string | number | null
        method?: string
        params?: { protocolVersion?: string }
      }
      if (request.headers.authorization !== 'Bearer test-access-token') {
        unauthenticatedMcpRequestCount += 1
        response.statusCode = 401
        response.setHeader(
          'www-authenticate',
          `Bearer resource_metadata="${origin}/.well-known/oauth-protected-resource"`
        )
        response.end()
        return
      }
      if (message.method === 'initialize') {
        json(response, {
          jsonrpc: '2.0',
          id: message.id,
          result: {
            protocolVersion: message.params?.protocolVersion ?? '2025-11-25',
            capabilities: { tools: {} },
            serverInfo: { name: 'test-oauth-mcp', version: '1.0.0' }
          }
        })
        return
      }
      if (message.method === 'notifications/initialized') {
        response.statusCode = 202
        response.end()
        return
      }
      if (message.method === 'tools/list') {
        json(response, {
          jsonrpc: '2.0',
          id: message.id,
          result: {
            tools: [
              {
                name: 'authenticated_echo',
                description: 'Echoes authenticated input.',
                inputSchema: { type: 'object', properties: {} }
              }
            ]
          }
        })
        return
      }
    }
    response.statusCode = 404
    response.end()
  })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const address = server.address()
  if (!address || typeof address === 'string')
    throw new Error('Test OAuth server did not bind to a port')
  origin = `http://127.0.0.1:${address.port}`

  return {
    origin,
    unauthenticatedMcpRequestCount: () => unauthenticatedMcpRequestCount,
    close: async () => {
      server.close()
      await once(server, 'close')
    }
  }
}

describe('McpOAuthService', () => {
  const tempPaths: string[] = []

  afterEach(async () => {
    await Promise.all(
      tempPaths.splice(0).map((tempPath) => rm(tempPath, { recursive: true, force: true }))
    )
  })

  it('completes browser OAuth through a loopback callback without exposing tokens to MCP settings', async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'tia-mcp-oauth-test-'))
    tempPaths.push(tempDir)
    const authRepository = new McpAuthRepository(path.join(tempDir, '.tia-studio', 'mcp-auth.json'))
    const oauthServer = await startOAuthServer()
    const service = new McpOAuthService(authRepository, {
      openAuthorizationUrl: async (authorizationUrl) => {
        expect(authorizationUrl.origin).toBe(oauthServer.origin)
        const callbackUrl = new URL(authorizationUrl.searchParams.get('redirect_uri')!)
        callbackUrl.searchParams.set('code', 'test-code')
        callbackUrl.searchParams.set('state', authorizationUrl.searchParams.get('state')!)
        const response = await fetch(callbackUrl)
        expect(response.status).toBe(200)
      }
    })

    try {
      await service.login('oauth', {
        isActive: true,
        name: 'OAuth test server',
        type: 'http',
        args: [],
        env: {},
        installSource: 'manual',
        url: `${oauthServer.origin}/mcp`
      })

      const saved = await authRepository.getState('oauth')
      expect(saved?.tokens).toMatchObject({
        access_token: 'test-access-token',
        refresh_token: 'test-refresh-token'
      })
      expect(saved?.serverUrl).toBe(`${oauthServer.origin}/mcp`)
      expect(saved?.codeVerifier).toBeUndefined()
      expect(saved?.state).toBeUndefined()
      expect(saved?.redirectUrl).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/oauth\/callback$/)

      const mcp = await createMcpClientTools(
        {
          mcpServers: {
            oauth: {
              isActive: true,
              name: 'OAuth test server',
              type: 'http',
              args: [],
              env: {},
              installSource: 'direct',
              url: `${oauthServer.origin}/mcp`
            }
          }
        },
        { mcpAuthRepository: authRepository }
      )
      expect(mcp.notices).toEqual([])
      expect(mcp.tools.map((tool) => tool.name)).toEqual(['mcp_oauth_authenticated_echo'])
      expect(oauthServer.unauthenticatedMcpRequestCount()).toBe(0)
      await mcp.close()
    } finally {
      await oauthServer.close()
    }
  })
})
