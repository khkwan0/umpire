import type {AuthPrincipal} from '../plugins/types.js'

export function anonymousAdminPrincipal(): AuthPrincipal {
  return {
    kind: 'anonymous',
    user: null,
    is_admin: true,
    can_write: true,
    plugins: 'all',
  }
}

export function anonymousReadOnlyPrincipal(): AuthPrincipal {
  return {
    kind: 'anonymous',
    user: null,
    is_admin: false,
    can_write: false,
    plugins: 'all',
  }
}
