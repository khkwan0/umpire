import type { CheckContext, CheckOutcome, CheckPlugin } from '../../types.js'
import { resolveHttpCheckConfigForTarget } from './config.js'
import { runHttpCheck } from './evaluate.js'
import { registerHttpCheckRoutes } from './routes.js'

const httpCheck: CheckPlugin = {
  id: 'http',

  async registerRoutes(app) {
    await registerHttpCheckRoutes(app)
  },

  async check(ctx: CheckContext): Promise<CheckOutcome> {
    const config = resolveHttpCheckConfigForTarget(ctx.config)
    return runHttpCheck(ctx.target.url, config)
  },
}

export default httpCheck
