import { useParams } from '@tanstack/react-router'
import { ReceivePage } from './ReceivePage.tsx'

export function ReceiveRoutePage() {
  const { key } = useParams({ strict: false })
  return key ? <ReceivePage routeKey={key} /> : <ReceivePage />
}
