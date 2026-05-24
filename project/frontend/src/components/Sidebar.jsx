import { TrendingUp, TrendingDown, AlertTriangle } from 'lucide-react'

const RISK_LABEL = {
  critical: 'Crítico',
  high:     'Alto',
  medium:   'Médio',
  low:      'Baixo',
}

export default function Sidebar({ areas, selectedId, onSelect }) {
  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <div className="sidebar-title">Áreas de Atuação FM</div>
        <div className="sidebar-count">{areas.length} polígonos prioritários</div>
      </div>

      <nav className="sidebar-list">
        {areas.map((area) => {
          const variation = area.kpis.ocorrencias_var
          const isUp = variation > 0
          return (
            <button
              key={area.id}
              className={`area-card ${selectedId === area.id ? 'active' : ''}`}
              onClick={() => onSelect(area.id)}
            >
              <div className="area-card-name">{area.shortName}</div>
              <div className="area-card-meta">
                <span className={`risk-badge ${area.risk}`}>
                  <AlertTriangle size={10} />
                  {RISK_LABEL[area.risk]}
                </span>
                <span className="area-card-meta-item">
                  {area.kpis.ocorrencias_30d} ocor.
                </span>
                <span className="area-card-meta-item" style={{ color: isUp ? 'var(--color-risk-critical)' : 'var(--color-risk-low)' }}>
                  {isUp ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
                  {variation > 0 ? '+' : ''}{variation}%
                </span>
              </div>
            </button>
          )
        })}
      </nav>
    </aside>
  )
}
