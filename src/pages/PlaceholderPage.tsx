import './PageLayout.css'

interface PlaceholderPageProps {
  title: string
}

export function PlaceholderPage({ title }: PlaceholderPageProps) {
  return (
    <section className="page">
      <header className="page__header">
        <div>
          <h1>{title}</h1>
          <p>Этот раздел появится в следующей версии.</p>
        </div>
      </header>
      <div className="empty-state">
        <strong>Раздел ещё не готов</strong>
        <p>Перейдите в «Крафты» или «Реагенты», чтобы работать с каталогом.</p>
      </div>
    </section>
  )
}
