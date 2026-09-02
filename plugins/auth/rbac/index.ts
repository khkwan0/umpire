import type {AuthPlugin} from '../../../api/src/plugins/types.js'
import {rbacBootstrap} from './bootstrap.js'
import {
  rbacEvaluateAccess,
  rbacPublicPaths,
  rbacResolvePrincipalOrAnonymous,
} from './gate.js'
import {registerRbacRoutes} from './routes.js'

const rbac: AuthPlugin = {
  id: 'rbac',
  description:
    'Username/password sessions, API tokens, and role-based access control',
  bootstrap: rbacBootstrap,
  registerRoutes: registerRbacRoutes,
  resolvePrincipal: rbacResolvePrincipalOrAnonymous,
  evaluateAccess: rbacEvaluateAccess,
  publicPaths: rbacPublicPaths,
}

export default rbac
