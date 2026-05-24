import { Download, FileText, TrendingUp, TrendingDown } from 'lucide-react'

export default function AreaHeader({ area, onExport }) {
  const { kpis } = area
  const isUp = kpis.ocorrencias_var > 0

  return (
    <div className="area-header">
      <div className="area-header-top">
        <div>
          <h2 className="area-name">{area.name}</h2>
          <p className="area-meta-text">
            {area.aisp} · {area.bairro} · Polígono atualizado 15/05/2026
          </p>
        </div>

        <div className="area-actions">
          <button className="btn" onClick={onExport}>
            <FileText size={14} />
            Relatório .docx
          </button>
          <button className="btn btn-primary" onClick={onExport}>
            <Download size={14} />
            Exportar dossiê
          </button>
        </div>
      </div>

      <div className="kpi-grid">
        <KPI label="Ocorrências (30d)" value={kpis.ocorrencias_30d} delta={kpis.ocorrencias_var} up={isUp} />
        <KPI label="Fatores urbanos ativos" value={kpis.fatores_urbanos} />
        <KPI label="Denúncias (90d)" value={kpis.denuncias} />
        <KPI label="Coincidências alto risco" value={kpis.coincidencias} highlight />
        <KPI label="Câmeras instaladas" value={area.cameras.length} />
      </div>
    </div>
  )
}

function KPI({ label, value, delta, up, highlight }) {
  return (
    <div className={`kpi-card ${highlight ? 'highlight' : ''}`}>
      <div className="kpi-label">{label}</div>
      <div className="kpi-value">
        {value}
        {typeof delta === 'number' && (
          <span className={`kpi-delta ${up ? 'up' : 'down'}`}>
            {up ? <TrendingUp size={12} style={{ verticalAlign: 'middle' }} /> : <TrendingDown size={12} style={{ verticalAlign: 'middle' }} />}
            {' '}{delta > 0 ? '+' : ''}{delta}%
          </span>
        )}
      </div>
    </div>
  )
}
