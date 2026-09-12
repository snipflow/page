import { useContext, useEffect, useState } from 'react'
import { ObjectUrlContext } from './object-url-context.ts'

export function useObjectUrlRegistry() {
  const registry = useContext(ObjectUrlContext)
  if (!registry) throw new Error('ObjectUrlProvider is missing')
  return registry
}

export function useObjectUrl(blob: Blob) {
  const registry = useObjectUrlRegistry()
  const [resource, setResource] = useState<{
    blob: Blob
    url: string
  } | null>(null)

  useEffect(() => {
    let current = true
    const url = registry.create(blob)
    void Promise.resolve().then(() => {
      if (current) setResource({ blob, url })
    })
    return () => {
      current = false
      registry.revoke(url)
    }
  }, [blob, registry])

  return resource?.blob === blob ? resource.url : null
}
