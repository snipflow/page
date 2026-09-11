import { LogOut } from 'lucide-react'
import { useAuthRuntime, useAuthSnapshot } from './auth-context.ts'
import type { FunctionalPath } from './auth-session.ts'
import { useSendStoreApi } from '../send/send-store.ts'

interface SessionHeaderProps {
  currentPath: FunctionalPath
}

export function SessionHeader({ currentPath }: SessionHeaderProps) {
  const { session } = useAuthRuntime()
  const snapshot = useAuthSnapshot()
  const sendStore = useSendStoreApi()

  const handleLogout = () => {
    if (
      sendStore.getState().hasUnsentDraft() &&
      !window.confirm('当前草稿尚未发送，确认退出并清除草稿？')
    ) {
      return
    }
    session.endSession({ target: currentPath })
  }

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
          onClick={handleLogout}
          title="退出当前会话"
        >
          <LogOut aria-hidden="true" />
          <span>退出</span>
        </button>
      </div>
    </header>
  )
}
