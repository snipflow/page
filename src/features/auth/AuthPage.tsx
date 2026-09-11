import { Eye, EyeOff, LogIn } from 'lucide-react'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { isSnipApiError } from '../../api/index.ts'
import { useAuthRuntime, useAuthSnapshot } from './auth-context.ts'

type SubmitPhase = 'idle' | 'submitting'

function authenticationErrorMessage(error: unknown) {
  if (isSnipApiError(error)) {
    if (error.status === 401) {
      return '令牌无效，请检查后重试。'
    }
    if (error.kind === 'network') {
      return '暂时无法连接服务，请检查网络后重试。'
    }
    if (error.kind === 'protocol') {
      return '认证服务返回了无法识别的响应。'
    }
  }
  return '无法完成身份验证，请稍后重试。'
}

export function AuthPage() {
  const runtime = useAuthRuntime()
  const snapshot = useAuthSnapshot()
  const requestRef = useRef<AbortController | null>(null)
  const [token, setToken] = useState('')
  const [showToken, setShowToken] = useState(false)
  const [phase, setPhase] = useState<SubmitPhase>('idle')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  useEffect(
    () => () => {
      requestRef.current?.abort()
    },
    [],
  )

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!token || phase === 'submitting') {
      if (!token) {
        setErrorMessage('请输入访问令牌。')
      }
      return
    }

    const controller = new AbortController()
    requestRef.current = controller
    setPhase('submitting')
    setErrorMessage(null)

    try {
      await runtime.verifyToken(token, controller.signal)
      if (controller.signal.aborted || requestRef.current !== controller) {
        return
      }

      runtime.session.establishSession(token)
    } catch (error) {
      if (!controller.signal.aborted && requestRef.current === controller) {
        setErrorMessage(authenticationErrorMessage(error))
      }
    } finally {
      if (!controller.signal.aborted && requestRef.current === controller) {
        requestRef.current = null
        setPhase('idle')
      }
    }
  }

  const submitting = phase === 'submitting'

  return (
    <main className="app-page app-page--auth" data-page="auth">
      <header className="app-header">
        <span className="app-brand">Snipflow</span>
      </header>
      <section className="auth-page" aria-labelledby="auth-title">
        <p className="status-page__eyebrow">身份验证</p>
        <h1 id="auth-title">连接 Snipflow</h1>

        <form className="auth-form" onSubmit={handleSubmit}>
          <label htmlFor="auth-token">访问令牌</label>
          <div className="auth-token-field">
            <input
              id="auth-token"
              name="token"
              type={showToken ? 'text' : 'password'}
              value={token}
              onChange={(event) => setToken(event.target.value)}
              autoComplete="current-password"
              autoCapitalize="none"
              spellCheck={false}
              disabled={submitting}
              aria-describedby={errorMessage ? 'auth-error' : undefined}
              aria-invalid={errorMessage ? true : undefined}
            />
            <button
              className="icon-button auth-token-toggle"
              type="button"
              onClick={() => setShowToken((visible) => !visible)}
              aria-label={showToken ? '隐藏令牌' : '显示令牌'}
              title={showToken ? '隐藏令牌' : '显示令牌'}
              disabled={submitting}
            >
              {showToken ? (
                <EyeOff aria-hidden="true" />
              ) : (
                <Eye aria-hidden="true" />
              )}
            </button>
          </div>

          {errorMessage ? (
            <p
              className="auth-message auth-message--error"
              id="auth-error"
              role="alert"
            >
              {errorMessage}
            </p>
          ) : null}
          {!snapshot.storageAvailable ? (
            <output className="auth-message">
              浏览器存储不可用，验证后仅保持当前页面会话。
            </output>
          ) : null}

          <button
            className="primary-button"
            type="submit"
            disabled={submitting}
          >
            <LogIn aria-hidden="true" />
            <span>{submitting ? '正在验证' : '验证并继续'}</span>
          </button>
        </form>
      </section>
    </main>
  )
}
