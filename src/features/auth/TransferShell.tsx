import { ArrowLeft, ArrowRight } from 'lucide-react'
import { Outlet, useLocation, useNavigate } from '@tanstack/react-router'
import { SessionHeader } from './SessionHeader.tsx'

export function TransferShell() {
  const location = useLocation()
  const navigate = useNavigate()
  const receiving = location.pathname === '/receive'
  const currentPath = receiving ? '/receive' : '/send'
  const target = receiving ? '/send' : '/receive'
  const targetLabel = receiving ? '前往发送' : '前往接收'

  return (
    <main
      className={`app-page app-page--${receiving ? 'receive' : 'send'}`}
      data-page={receiving ? 'receive' : 'send'}
    >
      <SessionHeader currentPath={currentPath} />
      <Outlet />
      <button
        className={`transfer-direction transfer-direction--${receiving ? 'left' : 'right'}`}
        type="button"
        onClick={() => navigate({ to: target })}
        aria-label={targetLabel}
        title={targetLabel}
      >
        {receiving ? (
          <ArrowLeft aria-hidden="true" />
        ) : (
          <ArrowRight aria-hidden="true" />
        )}
        <span>{targetLabel}</span>
      </button>
    </main>
  )
}
