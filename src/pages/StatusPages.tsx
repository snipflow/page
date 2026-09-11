interface StatusPageProps {
  eyebrow: string
  title: string
  tone: 'auth' | 'send' | 'receive' | 'dashboard' | 'neutral'
}

function StatusPage({ eyebrow, title, tone }: StatusPageProps) {
  return (
    <main className={`app-page app-page--${tone}`} data-page={tone}>
      <header className="app-header">
        <span className="app-brand">Snipflow</span>
      </header>
      <section className="status-page" aria-labelledby={`${tone}-title`}>
        <p className="status-page__eyebrow">{eyebrow}</p>
        <h1 id={`${tone}-title`}>{title}</h1>
      </section>
    </main>
  )
}

export function AuthPage() {
  return <StatusPage eyebrow="身份验证" title="连接 Snipflow" tone="auth" />
}

export function SendPage() {
  return <StatusPage eyebrow="发送" title="发送内容" tone="send" />
}

export function ReceivePage() {
  return <StatusPage eyebrow="接收" title="接收内容" tone="receive" />
}

export function DashboardPage() {
  return <StatusPage eyebrow="存储" title="存储概览" tone="dashboard" />
}

export function NotFoundPage() {
  return (
    <main className="app-page app-page--neutral">
      <section className="status-page" aria-labelledby="not-found-title">
        <p className="status-page__eyebrow">Snipflow</p>
        <h1 id="not-found-title">页面不存在</h1>
        <a href="/auth">返回首页</a>
      </section>
    </main>
  )
}

export function RouteErrorPage() {
  return (
    <main className="app-page app-page--neutral">
      <section className="status-page" aria-labelledby="route-error-title">
        <p className="status-page__eyebrow">Snipflow</p>
        <h1 id="route-error-title">无法打开页面</h1>
        <a href="/auth">返回首页</a>
      </section>
    </main>
  )
}
