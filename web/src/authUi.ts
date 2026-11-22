import type {AuthPolicy, AuthPrincipal} from './api'

/** Sign-in UI when the user is anonymous. Hidden only when auth is known off. */
export function shouldOfferSignIn(
  policy: AuthPolicy | null,
  principal: AuthPrincipal | null | undefined,
): boolean {
  if (principal?.kind === 'user') return false
  return policy?.auth_enabled !== false
}
