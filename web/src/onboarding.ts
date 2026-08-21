import {createContext, useContext} from 'react'

export const ONBOARDING_STORAGE_KEY = 'umpire-setup-tutorial'

export type OnboardingStep = 'target' | 'notifier'

export type OnboardingStatus = 'active' | 'skipped' | 'completed'

export type OnboardingState = {
  status: OnboardingStatus
  step: OnboardingStep
}

export type OnboardingContextValue = {
  active: boolean
  step: OnboardingStep
  hasTarget: boolean
  hasReadyNotifier: boolean
  forceNotifiersOpen: boolean
  skip: () => void
  finish: () => void
  restart: () => void
  continueToNotifier: () => void
}

export const OnboardingContext = createContext<OnboardingContextValue | null>(
  null,
)

export function useOnboarding(): OnboardingContextValue {
  const ctx = useContext(OnboardingContext)
  if (!ctx) {
    throw new Error('useOnboarding must be used within OnboardingProvider')
  }
  return ctx
}

function isStep(value: unknown): value is OnboardingStep {
  return value === 'target' || value === 'notifier'
}

function isStatus(value: unknown): value is OnboardingStatus {
  return value === 'active' || value === 'skipped' || value === 'completed'
}

export function readOnboarding(): OnboardingState | null {
  try {
    const raw = localStorage.getItem(ONBOARDING_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object') return null
    const rec = parsed as Record<string, unknown>
    if (!isStatus(rec.status)) return null
    return {
      status: rec.status,
      step: isStep(rec.step) ? rec.step : 'target',
    }
  } catch {
    return null
  }
}

export function writeOnboarding(state: OnboardingState): void {
  try {
    localStorage.setItem(ONBOARDING_STORAGE_KEY, JSON.stringify(state))
  } catch {
    // ignore quota / private mode
  }
}
