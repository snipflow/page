import { Outlet } from '@tanstack/react-router'
import { MotionProvider } from '../motion/MotionProvider.tsx'

export function RootLayout() {
  return (
    <MotionProvider>
      <Outlet />
    </MotionProvider>
  )
}
