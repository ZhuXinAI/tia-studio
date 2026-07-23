import type { Hono } from 'hono'
import { z } from 'zod'
import type { AppAgentRuntime } from '../../../shared/agent-runtime'
import type { AgentSessionsRepository } from '../../persistence/repos/agent-sessions-repo'
import type { WorkspacesRepository } from '../../persistence/repos/workspaces-repo'
import { logger } from '../../utils/logger'
import { resolve } from 'node:path'

const thinkingLevel = z.enum(['off', 'minimal', 'low', 'medium', 'high', 'xhigh'])
const accessMode = z.enum(['standard', 'full'])
const imageAttachment = z.object({
  id: z.string().min(1),
  type: z.literal('image'),
  name: z.string().min(1),
  mimeType: z.string().regex(/^image\//),
  size: z
    .number()
    .int()
    .nonnegative()
    .max(25 * 1024 * 1024),
  data: z.string().min(1)
})
const createSessionSchema = z.object({
  workspaceId: z.string().min(1).nullable(),
  workspacePath: z.string().min(1),
  title: z.string().trim().min(1).max(120).optional(),
  providerId: z.string().min(1),
  provider: z.string().min(1),
  modelId: z.string().min(1),
  thinkingLevel: thinkingLevel.optional(),
  accessMode: accessMode.optional()
})
const createTransientSessionSchema = z.object({
  purpose: z.literal('mcp-setup'),
  title: z.string().trim().min(1).max(120).optional(),
  providerId: z.string().min(1),
  provider: z.string().min(1),
  modelId: z.string().min(1),
  thinkingLevel: thinkingLevel.optional(),
  accessMode: accessMode.optional()
})
const sendMessageSchema = z
  .object({
    text: z.string().default(''),
    behavior: z.enum(['normal', 'steer', 'follow-up']).default('normal'),
    attachments: z.array(imageAttachment).max(8).optional()
  })
  .refine((value) => value.text.trim().length > 0 || Boolean(value.attachments?.length), {
    message: 'Message text or an image is required'
  })
const interactionResponseSchema = z.union([
  z.object({ id: z.string().min(1), value: z.string() }),
  z.object({ id: z.string().min(1), confirmed: z.boolean() }),
  z.object({
    id: z.string().min(1),
    permissionOutcome: z.enum(['deny', 'allow-once', 'allow-session', 'allow-workspace'])
  }),
  z.object({ id: z.string().min(1), cancelled: z.literal(true) })
])

async function jsonBody(context: { req: { json(): Promise<unknown> } }): Promise<unknown> {
  try {
    return await context.req.json()
  } catch {
    return Symbol.for('invalid-json')
  }
}

export function registerAgentRoute(
  app: Hono,
  options: {
    runtime: AppAgentRuntime
    sessionsRepo: AgentSessionsRepository
    workspacesRepo: Pick<WorkspacesRepository, 'ensureBuiltInChatsWorkspace' | 'getById'>
  }
): void {
  let sessionCreationInFlight = false
  let consecutiveCreationFailures = 0
  let sessionCreationBlockedUntil = 0

  app.get('/v1/agent/sessions', async (context) => {
    const workspaceId = context.req.query('workspaceId')
    const sessions =
      workspaceId === undefined
        ? await options.sessionsRepo.list()
        : await options.sessionsRepo.listByWorkspace(workspaceId === 'chats' ? null : workspaceId)
    return context.json(sessions)
  })

  app.post('/v1/agent/sessions', async (context) => {
    logger.info('[AgentRoute] Session creation requested', {
      event: 'agent-session-create-request'
    })
    const parsed = createSessionSchema.safeParse(await jsonBody(context))
    if (!parsed.success) return context.json({ error: parsed.error.issues[0]?.message }, 400)
    try {
      const workspace = parsed.data.workspaceId
        ? await options.workspacesRepo.getById(parsed.data.workspaceId)
        : await options.workspacesRepo.ensureBuiltInChatsWorkspace()
      if (
        !workspace ||
        (parsed.data.workspaceId === null && workspace.builtInKind !== 'chats') ||
        resolve(workspace.rootPath) !== resolve(parsed.data.workspacePath)
      ) {
        return context.json({ error: 'Workspace path is not authorized' }, 403)
      }
      if (sessionCreationInFlight || Date.now() < sessionCreationBlockedUntil) {
        logger.warn('[AgentRoute] Session creation rate limited', {
          event: 'agent-session-create-rate-limited',
          statusCode: 429,
          consecutiveCreationFailures
        })
        return context.json({ error: 'Pi session startup is temporarily rate limited' }, 429)
      }
      sessionCreationInFlight = true
      try {
        const created = await options.runtime.createSession({
          ...parsed.data,
          workspacePath: workspace.rootPath
        })
        consecutiveCreationFailures = 0
        sessionCreationBlockedUntil = 0
        return context.json(created, 201)
      } catch (error) {
        consecutiveCreationFailures += 1
        sessionCreationBlockedUntil =
          Date.now() + Math.min(60_000, 1_000 * 2 ** (consecutiveCreationFailures - 1))
        throw error
      } finally {
        sessionCreationInFlight = false
      }
    } catch (error) {
      logger.error('[AgentRoute] Session creation failed', {
        event: 'agent-session-create-failed',
        statusCode: 500,
        error: error instanceof Error ? error.message : 'Pi session failed'
      })
      return context.json(
        { error: error instanceof Error ? error.message : 'Pi session failed' },
        500
      )
    }
  })

  app.post('/v1/agent/transient-sessions', async (context) => {
    const parsed = createTransientSessionSchema.safeParse(await jsonBody(context))
    if (!parsed.success) return context.json({ error: parsed.error.issues[0]?.message }, 400)
    if (sessionCreationInFlight || Date.now() < sessionCreationBlockedUntil) {
      return context.json({ error: 'Pi session startup is temporarily rate limited' }, 429)
    }
    try {
      const workspace = await options.workspacesRepo.ensureBuiltInChatsWorkspace()
      sessionCreationInFlight = true
      const created = await options.runtime.createTransientSession({
        ...parsed.data,
        workspacePath: workspace.rootPath
      })
      consecutiveCreationFailures = 0
      sessionCreationBlockedUntil = 0
      return context.json(created, 201)
    } catch (error) {
      consecutiveCreationFailures += 1
      sessionCreationBlockedUntil =
        Date.now() + Math.min(60_000, 1_000 * 2 ** (consecutiveCreationFailures - 1))
      return context.json(
        { error: error instanceof Error ? error.message : 'Temporary Pi session failed' },
        500
      )
    } finally {
      sessionCreationInFlight = false
    }
  })

  app.delete('/v1/agent/transient-sessions/:sessionId', async (context) => {
    try {
      await options.runtime.closeTransientSession(context.req.param('sessionId'))
      return context.body(null, 204)
    } catch (error) {
      return context.json(
        { error: error instanceof Error ? error.message : 'Temporary thread not found' },
        404
      )
    }
  })

  app.post('/v1/agent/transient-sessions/:sessionId/promote', async (context) => {
    try {
      const workspace = await options.workspacesRepo.ensureBuiltInChatsWorkspace()
      const promoted = await options.runtime.promoteTransientSession({
        sessionId: context.req.param('sessionId'),
        workspaceId: null,
        workspacePath: workspace.rootPath
      })
      return context.json(promoted, 201)
    } catch (error) {
      return context.json(
        { error: error instanceof Error ? error.message : 'Could not continue temporary thread' },
        409
      )
    }
  })

  app.get('/v1/agent/sessions/:sessionId', async (context) => {
    try {
      return context.json(await options.runtime.getSession(context.req.param('sessionId')))
    } catch (error) {
      return context.json(
        { error: error instanceof Error ? error.message : 'Session not found' },
        404
      )
    }
  })

  app.delete('/v1/agent/sessions/:sessionId', async (context) => {
    const sessionId = context.req.param('sessionId')
    await options.runtime.closeSession(sessionId)
    const deleted = await options.sessionsRepo.delete(sessionId)
    return deleted ? context.body(null, 204) : context.json({ error: 'Session not found' }, 404)
  })

  app.get('/v1/agent/sessions/:sessionId/messages', async (context) => {
    try {
      return context.json(await options.runtime.getMessages(context.req.param('sessionId')))
    } catch (error) {
      return context.json(
        { error: error instanceof Error ? error.message : 'Session not found' },
        404
      )
    }
  })

  app.post('/v1/agent/sessions/:sessionId/messages', async (context) => {
    const parsed = sendMessageSchema.safeParse(await jsonBody(context))
    if (!parsed.success) return context.json({ error: parsed.error.issues[0]?.message }, 400)
    const receipt = await options.runtime.sendMessage({
      sessionId: context.req.param('sessionId'),
      ...parsed.data
    })
    return context.json(receipt, receipt.accepted ? 202 : 409)
  })

  app.post('/v1/agent/sessions/:sessionId/cancel', async (context) => {
    try {
      await options.runtime.cancelRun(context.req.param('sessionId'))
      return context.json({ ok: true })
    } catch (error) {
      return context.json({ error: error instanceof Error ? error.message : 'Cancel failed' }, 409)
    }
  })

  app.patch('/v1/agent/sessions/:sessionId/access', async (context) => {
    const parsed = z.object({ mode: accessMode }).safeParse(await jsonBody(context))
    if (!parsed.success) return context.json({ error: parsed.error.issues[0]?.message }, 400)
    try {
      await options.runtime.setAccessMode(context.req.param('sessionId'), parsed.data.mode)
      return context.json(await options.runtime.getSession(context.req.param('sessionId')))
    } catch (error) {
      return context.json(
        { error: error instanceof Error ? error.message : 'Access update failed' },
        409
      )
    }
  })

  app.patch('/v1/agent/sessions/:sessionId/model', async (context) => {
    const parsed = z
      .object({
        providerId: z.string().min(1),
        provider: z.string().min(1),
        modelId: z.string().min(1)
      })
      .safeParse(await jsonBody(context))
    if (!parsed.success) return context.json({ error: parsed.error.issues[0]?.message }, 400)
    try {
      await options.runtime.setModel(
        context.req.param('sessionId'),
        parsed.data.providerId,
        parsed.data.provider,
        parsed.data.modelId
      )
      return context.json(await options.runtime.getSession(context.req.param('sessionId')))
    } catch (error) {
      return context.json(
        { error: error instanceof Error ? error.message : 'Model update failed' },
        409
      )
    }
  })

  app.patch('/v1/agent/sessions/:sessionId/title', async (context) => {
    const parsed = z
      .object({ title: z.string().trim().min(1).max(120) })
      .safeParse(await jsonBody(context))
    if (!parsed.success) return context.json({ error: parsed.error.issues[0]?.message }, 400)
    await options.runtime.renameSession(context.req.param('sessionId'), parsed.data.title)
    return context.json(await options.runtime.getSession(context.req.param('sessionId')))
  })

  app.patch('/v1/agent/sessions/:sessionId/pinned', async (context) => {
    const parsed = z.object({ pinned: z.boolean() }).safeParse(await jsonBody(context))
    if (!parsed.success) return context.json({ error: parsed.error.issues[0]?.message }, 400)
    const updated = await options.sessionsRepo.update(context.req.param('sessionId'), parsed.data)
    return updated ? context.json(updated) : context.json({ error: 'Session not found' }, 404)
  })

  app.post('/v1/agent/sessions/:sessionId/interactions', async (context) => {
    const parsed = interactionResponseSchema.safeParse(await jsonBody(context))
    if (!parsed.success) return context.json({ error: parsed.error.issues[0]?.message }, 400)
    await options.runtime.respondToInteraction(context.req.param('sessionId'), parsed.data)
    return context.json({ ok: true })
  })

  app.get('/v1/agent/sessions/:sessionId/events', async (context) => {
    const sessionId = context.req.param('sessionId')
    try {
      await options.runtime.resumeSession(sessionId)
    } catch (error) {
      return context.json(
        { error: error instanceof Error ? error.message : 'Session not found' },
        404
      )
    }

    const encoder = new TextEncoder()
    let unsubscribe: () => void = () => undefined
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode(': connected\n\n'))
        unsubscribe = options.runtime.subscribe(sessionId, (event) => {
          controller.enqueue(
            encoder.encode(`id: ${event.eventId}\ndata: ${JSON.stringify(event)}\n\n`)
          )
        })
      },
      cancel() {
        unsubscribe()
      }
    })
    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive'
      }
    })
  })
}
