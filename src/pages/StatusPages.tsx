import { SessionHeader } from '../features/auth/SessionHeader.tsx'

interface StatusContentProps {
  eyebrow: string
  title: string
  tone: 'send' | 'receive' | 'dashboard'
}

function StatusContent({ eyebrow, title, tone }: StatusContentProps) {
  return (
    <section className="status-page" aria-labelledby={`${tone}-title`}>
      <p className="status-page__eyebrow">{eyebrow}</p>
      <h1 id={`${tone}-title`}>{title}</h1>
    </section>
  )
}

export function SendPage() {
  return <StatusContent eyebrow="发送" title="发送内容" tone="send" />
}

export function ReceivePage() {
  return <StatusContent eyebrow="接收" title="接收内容" tone="receive" />
}

export function DashboardPage() {
  return (
    <main className="app-page app-page--dashboard" data-page="dashboard">
      <SessionHeader currentPath="/dashboard" />
      <StatusContent eyebrow="存储" title="存储概览" tone="dashboard" />
    </main>
  )
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
