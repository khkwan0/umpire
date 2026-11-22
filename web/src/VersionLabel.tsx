import {useEffect, useState} from 'react'
import {api} from './api'

const WEB_VERSION = __WEB_VERSION__

export default function VersionLabel({className}: {className?: string}) {
  const [apiVersion, setApiVersion] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void api.version
      .get()
      .then(info => {
        if (!cancelled) setApiVersion(info.api)
      })
      .catch(() => {
        if (!cancelled) setApiVersion(null)
      })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <p className={className ?? 'muted small brand-versions'}>
      web {WEB_VERSION}
      {apiVersion ? ` · api ${apiVersion}` : ''}
    </p>
  )
}
