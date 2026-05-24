import { Layers, MapPin, AlertTriangle, Building2, Clock } from 'lucide-react'

function riskClass(score) {
  if (score >= 85) return 'critical'
  if (score >= 75) return 'high'
  return 'medium'
}

export default function CoincidencePanel({ area }) {
  return (
    <div>
      <div className="panel-section">
        <div className="section-header">
          <h3 className="section-title">
            <Layers size={16} color="var(--color-risk-high)" />
            Painel de coincidências — Alto risco
          </h3>
          <span className="muted" style={{ fontSize: 12 }}>
            {area.coincidences.length} cruzamentos com sobreposição crime + fator + horário + lacuna operacional
          </span>
        </div>
        <p className="section-subtitle">
          Cada coincidência é uma área onde mancha criminal, fator ambiental e padrão horário se sobrepõem a uma
          deficiência operacional. Use para priorização objetiva — evita dispersão de esforços.
        </p>

        {area.coincidences.map((c) => (
          <article key={c.id} className="coincidence-card">
            <div className="coincidence-card-header">
              <h4 className="coincidence-location">
                <MapPin size={14} style={{ verticalAlign: 'middle', marginRight: 6, color: 'var(--color-text-muted)' }} />
                {c.location}
                <span className="muted" style={{ marginLeft: 8, fontSize: 11, fontWeight: 500 }}>{c.id}</span>
              </h4>
              <span className={`risk-score ${riskClass(c.risk)}`}>
                <AlertTriangle size={12} />
                Risco {c.risk}
              </span>
            </div>

            <div className="coincidence-overlap">
              <div className="overlap-cell crime">
                <div className="overlap-label">Mancha criminal</div>
                <div className="overlap-value">{c.crime}</div>
              </div>
              <div className="overlap-cell factor">
                <div className="overlap-label">
                  <Building2 size={9} style={{ verticalAlign: 'middle', marginRight: 3 }} />
                  Fator urbano
                </div>
                <div className="overlap-value">{c.factor}</div>
              </div>
              <div className="overlap-cell time">
                <div className="overlap-label">
                  <Clock size={9} style={{ verticalAlign: 'middle', marginRight: 3 }} />
                  Padrão horário
                </div>
                <div className="overlap-value">{c.timeWindow}</div>
              </div>
              <div className="overlap-cell gap">
                <div className="overlap-label">Lacuna operacional</div>
                <div className="overlap-value">{c.operationalGap}</div>
              </div>
            </div>
          </article>
        ))}
      </div>
    </div>
  )
}
