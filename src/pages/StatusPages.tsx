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
