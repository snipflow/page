import { LogOut } from 'lucide-react'
import { useState } from 'react'
import { ConfirmationPopover } from '../../components/feedback/ActionPopover.tsx'
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
  const [logoutConfirmationOpen, setLogoutConfirmationOpen] = useState(false)

  const handleLogout = () => {
    setLogoutConfirmationOpen(false)
    session.endSession({ target: currentPath })
  }

  return (
    <header className="app-header session-header">
      <span className="app-brand">Snipflow</span>
      <div className="session-header__actions">
        {snapshot.persistence === 'memory' ? (
          <output className="session-badge">仅当前页面</output>
        ) : null}
        <ConfirmationPopover
          open={logoutConfirmationOpen}
          onOpenChange={(open) => {
            if (!open) {
              setLogoutConfirmationOpen(false)
            } else if (sendStore.getState().hasUnsentDraft()) {
              setLogoutConfirmationOpen(true)
            } else {
              handleLogout()
            }
          }}
          title="退出并清除草稿？"
          description="当前草稿尚未发送，退出后草稿内容将被清除。"
          confirmLabel="退出"
          onConfirm={handleLogout}
          trigger={
            <button
              className="logout-button"
              type="button"
              title="退出当前会话"
            >
              <LogOut aria-hidden="true" />
              <span>退出</span>
            </button>
          }
        />
      </div>
    </header>
  )
}
