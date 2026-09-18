import { createContext, useContext } from 'react'
import type { MotionLevel } from './motion-preferences.ts'

export interface MotionPreferences {
  documentVisible: boolean
  level: MotionLevel
}

export const MotionPreferencesContext = createContext<MotionPreferences>({
  documentVisible: true,
  level: 'reduced',
})

export function useMotionPreferences() {
  return useContext(MotionPreferencesContext)
}
