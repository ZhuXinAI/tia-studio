import type { Hono } from 'hono'
import { z } from 'zod'
import type { AppAgentRuntime } from '../../../shared/agent-runtime'
import type { TerminalEvent } from '../../../shared/terminal'
import type { TerminalService } from '../../terminal/terminal-service'

const startTerminalSchema = z.object({
  command: z.string().trim().min(1).max(8_000),
  cwd: z.string().trim().max(4_000).optional()
})

async function body(context: { req: { json(): Promise<unknown> } }): Promise<unknown> {
  try {
    return await context.req.json()
  } catch {
    return null
  }
}

export function registerTerminalRoute(
  app: Hono,
  options: { runtime: AppAgentRuntime; terminal: TerminalService }
): void {
  app.get('/v1/agent/sessions/:sessionId/terminal', async (context) => {
    try {
      await options.runtime.getSession(context.req.param('sessionId'))
      return context.json(options.terminal.listBySession(context.req.param('sessionId')))
    } catch (error) {
      return context.json(
        { error: error instanceof Error ? error.message : 'Session not found' },
        404
      )
    }
  })

  app.post('/v1/agent/sessions/:sessionId/terminal', async (context) => {
    const parsed = startTerminalSchema.safeParse(await body(context))
    if (!parsed.success) return context.json({ error: parsed.error.issues[0]?.message }, 400)
    try {
      const session = await options.runtime.getSession(context.req.param('sessionId'))
      const run = await options.terminal.start({
        sessionId: session.id,
        workspacePath: session.workspacePath,
        ...parsed.data
      })
      return context.json(run, 202)
    } catch (error) {
      return context.json(
        { error: error instanceof Error ? error.message : 'Terminal could not start' },
        409
      )
    }
  })

  app.post('/v1/agent/sessions/:sessionId/terminal/:terminalId/stop', async (context) => {
    try {
      const session = await options.runtime.getSession(context.req.param('sessionId'))
      const run = options.terminal.get(context.req.param('terminalId'))
      if (!run || run.sessionId !== session.id) {
        return context.json({ error: 'Terminal run not found' }, 404)
      }
      await options.terminal.stop(run.id)
      return context.json({ ok: true })
    } catch (error) {
      return context.json(
        { error: error instanceof Error ? error.message : 'Terminal run not found' },
        404
      )
    }
  })

  app.get('/v1/agent/sessions/:sessionId/terminal/:terminalId/events', async (context) => {
    let run: ReturnType<TerminalService['get']>
    try {
      const session = await options.runtime.getSession(context.req.param('sessionId'))
      run = options.terminal.get(context.req.param('terminalId'))
      if (!run || run.sessionId !== session.id) {
        return context.json({ error: 'Terminal run not found' }, 404)
      }
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
        const send = (event: TerminalEvent) => {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`))
          if (event.type === 'state' && event.run.status !== 'running') {
            unsubscribe()
            controller.close()
          }
        }
        controller.enqueue(encoder.encode(': connected\n\n'))
        send({ type: 'state', sequence: 0, run })
        if (run.status === 'running') {
          unsubscribe = options.terminal.subscribe(run.id, send)
          const latest = options.terminal.get(run.id)
          if (latest && latest.status !== 'running') {
            send({ type: 'state', sequence: 0, run: latest })
          }
        }
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
