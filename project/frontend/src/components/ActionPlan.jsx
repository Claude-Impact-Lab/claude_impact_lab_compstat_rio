import { ListChecks, Download, FileText, Sparkles } from 'lucide-react'

const PRIORITY_LABEL = {
  alta:  'Alta',
  media: 'Média',
  baixa: 'Baixa',
}

export default function ActionPlan({ area, onExport }) {
  const responsibles = [...new Set(area.actionPlan.map((a) => a.responsible))]

  return (
    <div>
      <div className="panel-section">
        <div className="section-header">
          <h3 className="section-title">
            <ListChecks size={16} color="var(--color-primary)" />
            Plano de ação — Responsabilização sugerida
          </h3>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn" onClick={onExport}>
              <FileText size={14} />
              Pré-popular planilha CompStat
            </button>
            <button className="btn btn-primary" onClick={onExport}>
              <Download size={14} />
              Exportar .docx
            </button>
          </div>
        </div>
        <p className="section-subtitle">
          <Sparkles size={12} color="var(--color-accent)" style={{ verticalAlign: 'middle', marginRight: 4 }} />
          Sugestões geradas automaticamente a partir das coincidências identificadas. Revise, ajuste e formalize
          na reunião de CompStat.
        </p>

        <div className="evidence-strip" style={{ marginTop: 0, marginBottom: 16, paddingTop: 0, borderTop: 'none' }}>
          <strong>Órgãos envolvidos:</strong>
          {responsibles.map((r) => (
            <span key={r} className={`responsible-chip ${r}`}>{r}</span>
          ))}
        </div>

        <table className="action-table">
          <thead>
            <tr>
              <th style={{ width: 130 }}>Responsável</th>
              <th>Ação sugerida</th>
              <th>Justificativa</th>
              <th style={{ width: 90 }}>Prioridade</th>
            </tr>
          </thead>
          <tbody>
            {area.actionPlan.map((a, i) => (
              <tr key={i}>
                <td>
                  <span className={`responsible-chip ${a.responsible}`}>{a.responsible}</span>
                </td>
                <td>{a.action}</td>
                <td className="muted">{a.justification}</td>
                <td>
                  <span className={`priority-chip ${a.priority}`}>{PRIORITY_LABEL[a.priority]}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
