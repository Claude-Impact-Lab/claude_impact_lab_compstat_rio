import { Shield, Download, RefreshCw, Database } from 'lucide-react'

export default function Header({ sources, dataset, referenceDate, onExport }) {
  const isReal = dataset === 'real'
  const tooltip = (sources ?? [])
    .map((s) => `${s.label}: ${s.records.toLocaleString('pt-BR')} reg.`)
    .join('\n')

  return (
    <header className="header">
      <div className="header-brand">
        <div className="header-logo">
          <Shield size={20} color="white" />
        </div>
        <div>
          <h1 className="header-title">CompStat Rio</h1>
          <p className="header-subtitle">Plataforma de Inteligência Criminal — Prefeitura do Rio de Janeiro</p>
        </div>
      </div>

      <div className="header-actions">
        <span className="header-pill" title={tooltip}>
          <span className={`status-dot ${isReal ? '' : 'mock'}`} />
          {isReal ? 'Dados reais ingeridos' : 'Dados de demonstração'}
          {sources && (
            <span style={{ opacity: 0.75, marginLeft: 4 }}>· {sources.length} fontes</span>
          )}
        </span>
        <div className="header-meta">
          <span className="header-meta-strong">
            {isReal ? 'Data de referência' : 'Próxima reunião CompStat'}
          </span>
          <span>
            {isReal
              ? referenceDate ?? '—'
              : 'Quarta, 27/05/2026 — 09h'}
          </span>
        </div>
        <button className="btn" onClick={() => window.location.reload()} title="Reiniciar fluxo">
          <RefreshCw size={14} />
          Recarregar
        </button>
        <button className="btn btn-accent" onClick={onExport}>
          <Download size={14} />
          Exportar Relatório
        </button>
      </div>
    </header>
  )
}
