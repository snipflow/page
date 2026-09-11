import { LogOut } from 'lucide-react'
import { useAuthRuntime, useAuthSnapshot } from './auth-context.ts'
import type { FunctionalPath } from './auth-session.ts'

interface SessionHeaderProps {
  currentPath: FunctionalPath
}

export function SessionHeader({ currentPath }: SessionHeaderProps) {
  const { session } = useAuthRuntime()
  const snapshot = useAuthSnapshot()

  return (
    <header className="app-header session-header">
      <span className="app-brand">Snipflow</span>
      <div className="session-header__actions">
        {snapshot.persistence === 'memory' ? (
          <output className="session-badge">仅当前页面</output>
        ) : null}
        <button
          className="logout-button"
          type="button"
          onClick={() => session.endSession({ target: currentPath })}
          title="退出当前会话"
        >
          <LogOut aria-hidden="true" />
          <span>退出</span>
        </button>
      </div>
    </header>
  )
}
