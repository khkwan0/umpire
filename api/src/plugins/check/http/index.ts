import type { CheckOutcome, CheckPlugin } from '../../types.js'
import { readConfig } from './config.js'
import { runHttpCheck } from './evaluate.js'
import { registerHttpCheckRoutes } from './routes.js'

const httpCheck: CheckPlugin = {
  id: 'http',

  async registerRoutes(app) {
    await registerHttpCheckRoutes(app)
  },

  async check(url: string): Promise<CheckOutcome> {
    return runHttpCheck(url, readConfig())
  },
}

export default httpCheck
