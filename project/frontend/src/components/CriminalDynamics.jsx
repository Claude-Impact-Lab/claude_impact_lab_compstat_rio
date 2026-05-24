import { Brain, Target, Users, Route, Store, FileText, MessageSquare } from 'lucide-react'

export default function CriminalDynamics({ area }) {
  const d = area.dynamics

  return (
    <div>
      <div className="panel-section">
        <div className="section-header">
          <h3 className="section-title">
            <Brain size={16} color="#7c3aed" />
            Síntese qualitativa — Dinâmica criminal
          </h3>
          <span className="muted" style={{ fontSize: 12 }}>
            Síntese de RELINTs + Disque Denúncia
          </span>
        </div>
        <p className="section-subtitle">
          A IA consolida os RELINTs da área e as denúncias do Disque Denúncia para destacar o modus operandi
          predominante, perfis observados, rotas de fuga e pontos de receptação que orientam a operação.
        </p>

        <div className="dynamics-grid">
          <DynCard icon={Target}  title="Modus operandi"     text={d.modusOperandi} />
          <DynCard icon={Users}   title="Perfil de suspeitos" text={d.suspectProfile} />
          <DynCard icon={Route}   title="Rotas de fuga"       text={d.escapeRoutes} />
          <DynCard icon={Store}   title="Pontos de receptação" text={d.receivingPoints} />
        </div>

        <div className="evidence-strip">
          <strong>Evidências consolidadas:</strong>
          <span className="evidence-tag">
            <FileText size={11} /> {d.sources.relints} RELINT{d.sources.relints !== 1 ? 's' : ''}
          </span>
          <span className="evidence-tag">
            <MessageSquare size={11} /> {d.sources.denuncias} denúncias (90d)
          </span>
          <span className="evidence-tag">
            <Target size={11} /> {d.sources.ocorrencias} ocorrências (90d)
          </span>
        </div>
      </div>
    </div>
  )
}

function DynCard({ icon: Icon, title, text }) {
  return (
    <article className="dynamics-card">
      <h4 className="dynamics-card-title">
        <Icon size={13} />
        {title}
      </h4>
      <p className="dynamics-card-body">{text}</p>
    </article>
  )
}
