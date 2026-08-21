import type {
  CheckContext,
  CheckOutcome,
  CheckPlugin,
  TargetCompatibility,
  TargetEvalParams,
} from '../../../api/src/plugins/types.js'
import {parseTargetAddress} from '../../../api/src/targetAddress.js'
import {resolveHttpCheckConfigForTarget} from './config.js'
import {runHttpCheck} from './evaluate.js'
import {registerHttpCheckRoutes} from './routes.js'

export function evaluateHttpTarget(
  params: TargetEvalParams,
): TargetCompatibility {
  const parsed = parseTargetAddress(params.url)
  if (!parsed || !parsed.hasScheme) {
    return {ok: false, reason: 'requires an http:// or https:// URL'}
  }
  return {ok: true}
}

const httpCheck: CheckPlugin = {
  id: 'http',
  description:
    'Requests the target URL over HTTP(S) and fails on unexpected status codes or latency.',

  evaluateTarget: evaluateHttpTarget,

  async registerRoutes(app) {
    await registerHttpCheckRoutes(app)
  },

  async check(ctx: CheckContext): Promise<CheckOutcome> {
    const config = resolveHttpCheckConfigForTarget(ctx.config)
    return runHttpCheck(ctx.target.url, config)
  },
}

export default httpCheck
