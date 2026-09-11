import { Component, type ErrorInfo, type ReactNode } from 'react'

interface AppErrorBoundaryProps {
  children: ReactNode
}

interface AppErrorBoundaryState {
  hasError: boolean
}

export class AppErrorBoundary extends Component<
  AppErrorBoundaryProps,
  AppErrorBoundaryState
> {
  state: AppErrorBoundaryState = { hasError: false }

  static getDerivedStateFromError(): AppErrorBoundaryState {
    return { hasError: true }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Unhandled application error', error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      return (
        <main className="app-page app-page--neutral">
          <section className="status-page" aria-labelledby="app-error-title">
            <p className="status-page__eyebrow">Snipflow</p>
            <h1 id="app-error-title">页面暂时不可用</h1>
            <button type="button" onClick={() => window.location.reload()}>
              重新加载
            </button>
          </section>
        </main>
      )
    }

    return this.props.children
  }
}
