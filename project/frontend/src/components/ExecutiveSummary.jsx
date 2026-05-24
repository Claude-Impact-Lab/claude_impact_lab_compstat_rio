import { Sparkles, HelpCircle } from 'lucide-react'

export default function ExecutiveSummary({ area }) {
  return (
    <div>
      <div className="panel-section">
        <div className="section-header">
          <h3 className="section-title">
            <Sparkles size={16} color="var(--color-accent)" />
            Resumo executivo gerado por IA
          </h3>
          <span className="muted" style={{ fontSize: 12 }}>
            Síntese das 5 fontes integradas · janela de 30 dias
          </span>
        </div>
        <p className="section-subtitle">
          Perguntas norteadoras respondidas automaticamente com base no cruzamento de ocorrências,
          denúncias, fatores urbanos, RELINTs e polígonos da FM. Subsidia o briefing da reunião CompStat.
        </p>

        <div className="qa-list">
          {area.executiveSummary.map((qa, i) => (
            <article className="qa-item" key={i}>
              <h4 className="qa-question">
                <HelpCircle size={13} style={{ verticalAlign: 'middle', marginRight: 4 }} />
                {qa.q}
              </h4>
              <p className="qa-answer">{qa.a}</p>
              <div className="qa-source">
                <span>Fontes:</span>
                {qa.sources.map((s) => (
                  <span key={s} className="source-tag">{s}</span>
                ))}
              </div>
            </article>
          ))}
        </div>
      </div>
    </div>
  )
}
