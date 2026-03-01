import { Hono } from 'hono'
import { createBearerAuthMiddleware } from './auth-middleware'
import { registerHealthRoute } from './routes/health-route'

type CreateAppOptions = {
  token: string
}

export function createApp(options: CreateAppOptions): Hono {
  const app = new Hono()

  app.use('/v1/*', createBearerAuthMiddleware(options.token))
  registerHealthRoute(app)

  return app
}
