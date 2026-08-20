import type {
  CheckContext,
  CheckOutcome,
  CheckPlugin,
} from '../../../api/src/plugins/types.js'
import {resolveHttpCheckConfigForTarget} from './config.js'
import {runHttpCheck} from './evaluate.js'
import {registerHttpCheckRoutes} from './routes.js'

const httpCheck: CheckPlugin = {
  id: 'http',
  description:
    'Requests the target URL over HTTP(S) and fails on unexpected status codes or latency.',

  async registerRoutes(app) {
    await registerHttpCheckRoutes(app)
  },

  async check(ctx: CheckContext): Promise<CheckOutcome> {
    const config = resolveHttpCheckConfigForTarget(ctx.config)
    return runHttpCheck(ctx.target.url, config)
  },
}

export default httpCheck
