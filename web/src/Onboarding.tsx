import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type WheelEvent,
} from 'react'
import {useLocation, useNavigate} from 'react-router-dom'
import {api} from './api'
import {
  OnboardingContext,
  readOnboarding,
  useOnboarding,
  writeOnboarding,
  type OnboardingContextValue,
  type OnboardingState,
  type OnboardingStatus,
  type OnboardingStep,
} from './onboarding'
import {useRealtimeRefresh} from './realtime'

type HighlightId =
  | 'targets-panel'
  | 'targets-nav'
  | 'add-target'
  | 'notifiers-nav'
  | 'notifier-page'

function persist(status: OnboardingStatus, step: OnboardingStep): void {
  writeOnboarding({status, step})
}

function highlightIdFor(
  step: OnboardingStep,
  pathname: string,
): HighlightId | null {
  if (step === 'target') {
    if (pathname === '/targets') return 'add-target'
    if (pathname === '/') return 'targets-panel'
    return 'targets-nav'
  }
  if (pathname.startsWith('/plugins/notify/')) return 'notifier-page'
  return 'notifiers-nav'
}

function findHighlight(id: HighlightId): HTMLElement | null {
  if (id === 'notifier-page') {
    return document.querySelector('main .panel')
  }
  return document.querySelector(`[data-onboarding="${id}"]`)
}

function unionRect(el: HTMLElement): DOMRect {
  const r = el.getBoundingClientRect()
  let top = r.top
  let left = r.left
  let right = r.right
  let bottom = r.bottom
  const menu = el.querySelector('.nav-dropdown-menu')
  if (menu instanceof HTMLElement) {
    const c = menu.getBoundingClientRect()
    if (c.width > 0 && c.height > 0) {
      top = Math.min(top, c.top)
      left = Math.min(left, c.left)
      right = Math.max(right, c.right)
      bottom = Math.max(bottom, c.bottom)
    }
  }
  return new DOMRect(left, top, right - left, bottom - top)
}

function sameRect(a: DOMRect | null, b: DOMRect | null): boolean {
  if (a === b) return true
  if (!a || !b) return false
  return (
    a.top === b.top &&
    a.left === b.left &&
    a.width === b.width &&
    a.height === b.height
  )
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n))
}

function placeCard(
  anchor: DOMRect | null,
  cardW: number,
  cardH: number,
): {top: number; left: number} {
  const gap = 14
  const margin = 12
  const vw = window.innerWidth
  const vh = window.innerHeight
  const maxLeft = Math.max(margin, vw - cardW - margin)
  const maxTop = Math.max(margin, vh - cardH - margin)

  if (!anchor) {
    return {
      top: clamp((vh - cardH) / 2, margin, maxTop),
      left: clamp((vw - cardW) / 2, margin, maxLeft),
    }
  }

  if (anchor.height > vh * 0.45 || anchor.width > vw * 0.72) {
    return {
      top: clamp(vh - cardH - margin, margin, maxTop),
      left: clamp(vw - cardW - margin, margin, maxLeft),
    }
  }

  const tryPos = (top: number, left: number) => ({
    top: clamp(top, margin, maxTop),
    left: clamp(left, margin, maxLeft),
  })

  const below = anchor.bottom + gap
  if (below + cardH + margin <= vh) {
    return tryPos(below, anchor.left)
  }
  const above = anchor.top - cardH - gap
  if (above >= margin) {
    return tryPos(above, anchor.left)
  }
  const right = anchor.right + gap
  if (right + cardW + margin <= vw) {
    return tryPos(anchor.top, right)
  }
  const left = anchor.left - cardW - gap
  if (left >= margin) {
    return tryPos(anchor.top, left)
  }
  return tryPos(below, anchor.left)
}

export function OnboardingProvider({children}: {children: ReactNode}) {
  const location = useLocation()
  const navigate = useNavigate()
  const [hydrated, setHydrated] = useState(false)
  const [status, setStatus] = useState<OnboardingStatus | 'idle'>('idle')
  const [step, setStep] = useState<OnboardingStep>('target')
  const [hasTarget, setHasTarget] = useState(false)
  const [targetCount, setTargetCount] = useState(0)
  const [hasReadyNotifier, setHasReadyNotifier] = useState(false)
  const [targetBaseline, setTargetBaseline] = useState(0)

  const applySnapshot = useCallback((count: number, readyNotifier: boolean) => {
    setTargetCount(count)
    setHasTarget(count > 0)
    setHasReadyNotifier(readyNotifier)
  }, [])

  const loadSnapshot = useCallback(async () => {
    const [snap, manager] = await Promise.all([
      api.status(),
      api.pluginManager.get(),
    ])
    return {
      targetCount: snap.targets.length,
      readyNotifier: manager.notifiers.some(n => n.enabled && n.ready),
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    async function init() {
      const stored = readOnboarding()
      let targetCount = 0
      try {
        const snap = await loadSnapshot()
        if (cancelled) return
        targetCount = snap.targetCount
        applySnapshot(snap.targetCount, snap.readyNotifier)
      } catch {
        if (cancelled) return
      }

      if (stored?.status === 'skipped' || stored?.status === 'completed') {
        setStatus(stored.status)
        setStep(stored.step)
      } else if (stored?.status === 'active') {
        setStatus('active')
        setStep(stored.step)
      } else if (targetCount === 0) {
        const next: OnboardingState = {status: 'active', step: 'target'}
        writeOnboarding(next)
        setStatus('active')
        setStep('target')
      } else {
        persist('completed', 'notifier')
        setStatus('completed')
      }
      setHydrated(true)
    }
    void init()
    return () => {
      cancelled = true
    }
  }, [applySnapshot, loadSnapshot])

  const refresh = useCallback(async () => {
    if (status !== 'active') return
    try {
      const snap = await loadSnapshot()
      applySnapshot(snap.targetCount, snap.readyNotifier)
    } catch {
      // keep last snapshot
    }
  }, [applySnapshot, loadSnapshot, status])

  useRealtimeRefresh(refresh)

  useEffect(() => {
    if (status !== 'active') return
    const id = window.setInterval(() => {
      void refresh()
    }, 1500)
    return () => window.clearInterval(id)
  }, [refresh, status])

  useEffect(() => {
    if (status !== 'active') return
    if (step === 'target' && targetCount > targetBaseline) {
      setStep('notifier')
      persist('active', 'notifier')
    }
  }, [status, step, targetBaseline, targetCount])

  const skip = useCallback(() => {
    persist('skipped', step)
    setStatus('skipped')
  }, [step])

  const finish = useCallback(() => {
    persist('completed', 'notifier')
    setStatus('completed')
  }, [])

  const continueToNotifier = useCallback(() => {
    persist('active', 'notifier')
    setStep('notifier')
  }, [])

  const restart = useCallback(() => {
    void (async () => {
      let count = targetCount
      try {
        const snap = await loadSnapshot()
        applySnapshot(snap.targetCount, snap.readyNotifier)
        count = snap.targetCount
      } catch {
        // keep last snapshot
      }
      setTargetBaseline(count)
      persist('active', 'target')
      setStatus('active')
      setStep('target')
      navigate('/')
    })()
  }, [applySnapshot, loadSnapshot, navigate, targetCount])

  const forceNotifiersOpen =
    status === 'active' &&
    step === 'notifier' &&
    !location.pathname.startsWith('/plugins/notify/')

  const value = useMemo<OnboardingContextValue>(
    () => ({
      active: hydrated && status === 'active',
      step,
      hasTarget,
      hasReadyNotifier,
      forceNotifiersOpen,
      skip,
      finish,
      restart,
      continueToNotifier,
    }),
    [
      continueToNotifier,
      finish,
      forceNotifiersOpen,
      hasReadyNotifier,
      hasTarget,
      hydrated,
      restart,
      skip,
      status,
      step,
    ],
  )

  return (
    <OnboardingContext.Provider value={value}>
      {children}
      {value.active ? <OnboardingTour /> : null}
    </OnboardingContext.Provider>
  )
}

function OnboardingTour() {
  const {step, hasTarget, hasReadyNotifier, skip, finish, continueToNotifier} =
    useOnboarding()
  const location = useLocation()
  const navigate = useNavigate()
  const cardRef = useRef<HTMLDivElement>(null)
  const [anchor, setAnchor] = useState<DOMRect | null>(null)
  const [cardSize, setCardSize] = useState({width: 352, height: 200})

  const highlightId = highlightIdFor(step, location.pathname)

  const measure = useCallback(() => {
    if (!highlightId) {
      setAnchor(null)
      return
    }
    const el = findHighlight(highlightId)
    const next = el ? unionRect(el) : null
    setAnchor(prev => (sameRect(prev, next) ? prev : next))
    const card = cardRef.current
    if (card) {
      const r = card.getBoundingClientRect()
      setCardSize(prev =>
        prev.width === r.width && prev.height === r.height
          ? prev
          : {width: r.width, height: r.height},
      )
    }
  }, [highlightId])

  useLayoutEffect(() => {
    measure()
    const el = highlightId ? findHighlight(highlightId) : null
    if (!el) return
    el.classList.add('onboarding-spot')
    if (typeof el.scrollIntoView === 'function') {
      el.scrollIntoView({
        block: highlightId === 'targets-panel' ? 'center' : 'nearest',
        inline: 'nearest',
      })
    }
    return () => el.classList.remove('onboarding-spot')
  }, [highlightId, location.pathname, measure, step])

  useEffect(() => {
    const onWin = () => measure()
    window.addEventListener('resize', onWin)
    window.addEventListener('scroll', onWin, true)
    const obs = new MutationObserver(onWin)
    obs.observe(document.body, {childList: true, subtree: true})
    const t1 = window.setTimeout(onWin, 50)
    const t2 = window.setTimeout(onWin, 200)
    return () => {
      window.removeEventListener('resize', onWin)
      window.removeEventListener('scroll', onWin, true)
      obs.disconnect()
      window.clearTimeout(t1)
      window.clearTimeout(t2)
    }
  }, [measure])

  const pad = 8
  const hole = anchor
    ? {
        top: Math.max(0, anchor.top - pad),
        left: Math.max(0, anchor.left - pad),
        width: anchor.width + pad * 2,
        height: anchor.height + pad * 2,
      }
    : null
  const holeRight = hole ? hole.left + hole.width : 0
  const holeBottom = hole ? hole.top + hole.height : 0
  const radius =
    highlightId === 'targets-nav' || highlightId === 'notifiers-nav' ? 18 : 16

  const cardPos = placeCard(
    hole ? new DOMRect(hole.left, hole.top, hole.width, hole.height) : null,
    cardSize.width,
    cardSize.height,
  )

  const copy = tourCopy(step, highlightId, hasReadyNotifier, hasTarget)
  const showFinish = step === 'notifier' && hasReadyNotifier
  const showContinue = step === 'target' && hasTarget

  function onShadeWheel(event: WheelEvent<HTMLDivElement>) {
    window.scrollBy(0, event.deltaY)
  }

  return (
    <div className="onboarding" aria-live="polite">
      {hole ? (
        <>
          <div
            className="onboarding-shade"
            style={{top: 0, left: 0, right: 0, height: hole.top}}
            onWheel={onShadeWheel}
          />
          <div
            className="onboarding-shade"
            style={{
              top: holeBottom,
              left: 0,
              right: 0,
              bottom: 0,
            }}
            onWheel={onShadeWheel}
          />
          <div
            className="onboarding-shade"
            style={{
              top: hole.top,
              left: 0,
              width: hole.left,
              height: hole.height,
            }}
            onWheel={onShadeWheel}
          />
          <div
            className="onboarding-shade"
            style={{
              top: hole.top,
              left: holeRight,
              right: 0,
              height: hole.height,
            }}
            onWheel={onShadeWheel}
          />
          <div
            className="onboarding-ring"
            style={{
              top: hole.top,
              left: hole.left,
              width: hole.width,
              height: hole.height,
              borderRadius: radius,
            }}
          />
        </>
      ) : (
        <div className="onboarding-shade onboarding-shade-full" />
      )}

      <div
        ref={cardRef}
        className="onboarding-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="onboarding-title"
        aria-describedby="onboarding-body"
        style={{top: cardPos.top, left: cardPos.left}}
      >
        <p className="onboarding-kicker">{copy.kicker}</p>
        <h2 id="onboarding-title">{copy.title}</h2>
        <p id="onboarding-body">{copy.body}</p>
        <div className="onboarding-actions">
          {!showFinish ? (
            <button type="button" className="ghost" onClick={skip}>
              Skip tutorial
            </button>
          ) : (
            <span />
          )}
          {copy.primary === 'targets' ? (
            <button type="button" onClick={() => navigate('/targets')}>
              Add a target
            </button>
          ) : null}
          {showContinue ? (
            <button type="button" onClick={continueToNotifier}>
              Continue
            </button>
          ) : null}
          {showFinish ? (
            <button type="button" onClick={finish}>
              Finish
            </button>
          ) : null}
        </div>
      </div>
    </div>
  )
}

function tourCopy(
  step: OnboardingStep,
  highlightId: HighlightId | null,
  hasReadyNotifier: boolean,
  hasTarget: boolean,
): {kicker: string; title: string; body: string; primary: 'targets' | null} {
  if (step === 'target') {
    const onForm = highlightId === 'add-target'
    return {
      kicker: 'Step 1 of 2',
      title: onForm ? 'Add a target' : 'Start with a target',
      body: onForm
        ? hasTarget
          ? 'You can add another target, or continue to set up a notifier. Leave checks and notifiers on their defaults unless you want a subset.'
          : 'Paste a hostname, IP, or http(s) URL and click Add. You can leave checks and notifiers on their defaults.'
        : hasTarget
          ? 'This is the Targets panel. Add another target, or continue to set up a notifier.'
          : 'This is the Targets panel. Add a target to watch first — then we will set up a notifier so you get alerts.',
      primary: onForm ? null : 'targets',
    }
  }
  if (hasReadyNotifier) {
    return {
      kicker: 'Step 2 of 2',
      title: "You're set",
      body: 'UMPIRE will check your target on its interval and notify you when something goes down. Add more targets or notifiers anytime.',
      primary: null,
    }
  }
  const onPage = highlightId === 'notifier-page'
  return {
    kicker: 'Step 2 of 2',
    title: onPage ? 'Configure this notifier' : 'Add a notifier',
    body: onPage
      ? 'Fill in the destination and Save. When this notifier is ready, alerts can go out. You can skip and come back later.'
      : 'Now set up a notifier so UMPIRE can reach you. The Notifiers menu is open — pick one (Webhook is enabled by default) and add a destination.',
    primary: null,
  }
}
