import {
  LazyMotion,
  MotionConfig,
  domMax,
  useReducedMotion,
} from 'motion/react'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { MotionPreferencesContext } from './motion-context.ts'
import { deriveMotionLevel } from './motion-preferences.ts'

interface MotionProviderProps {
  children: ReactNode
}

interface NavigatorWithMemory extends Navigator {
  deviceMemory?: number
}

export function MotionProvider({ children }: MotionProviderProps) {
  const reducedMotion = useReducedMotion() ?? false
  const [documentVisible, setDocumentVisible] = useState(
    () =>
      typeof document === 'undefined' || document.visibilityState !== 'hidden',
  )

  useEffect(() => {
    const updateVisibility = () => {
      setDocumentVisible(document.visibilityState !== 'hidden')
    }
    document.addEventListener('visibilitychange', updateVisibility)
    return () =>
      document.removeEventListener('visibilitychange', updateVisibility)
  }, [])

  const value = useMemo(() => {
    const runtimeNavigator = navigator as NavigatorWithMemory
    return {
      documentVisible,
      level: deriveMotionLevel({
        deviceMemory: runtimeNavigator.deviceMemory,
        hardwareConcurrency: runtimeNavigator.hardwareConcurrency,
        reducedMotion,
      }),
    }
  }, [documentVisible, reducedMotion])

  return (
    <MotionPreferencesContext.Provider value={value}>
      <LazyMotion features={domMax} strict>
        <MotionConfig reducedMotion="user">{children}</MotionConfig>
      </LazyMotion>
    </MotionPreferencesContext.Provider>
  )
}
