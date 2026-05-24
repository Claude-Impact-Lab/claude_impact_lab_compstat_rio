import { useCallback, useEffect, useState } from 'react'
import {
  X,
  Radar,
  AlertTriangle,
  MapPin,
  Clock,
  ExternalLink,
  Newspaper,
  Loader2,
  RefreshCw,
} from 'lucide-react'

const SOURCE_META = {
  g1_rio: { label: 'G1 Rio', Icon: Newspaper, color: '#c4170c' },
  o_dia:  { label: 'O Dia',  Icon: Newspaper, color: '#003a70' },
}

const KIND_META = {
  denuncia:   { label: 'Denúncia',   color: 'var(--color-risk-critical)' },
  noticia:    { label: 'Notícia',    color: 'var(--color-primary)' },
  comentario: { label: 'Comentário', color: 'var(--color-text-muted)' },
}

function fmtDate(iso) {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleString('pt-BR', {
      day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
    })
  } catch { return iso }
}

function summarize(alerts) {
  const acc = { denuncia: 0, noticia: 0, comentario: 0 }
  for (const a of alerts) acc[a.kind] = (acc[a.kind] ?? 0) + 1
  return acc
}

/**
 * Modal disparado pelo botão do Header. Auto-roda a análise no mount;
 * "Re-analisar" refaz a chamada. Fechar via X, click fora, ou Esc.
 */
export default function MonitorWebModal({ onClose }) {
  const [state, setState] = useState({ status: 'loading' })

  const run = useCallback(async () => {
    setState({ status: 'loading' })
    try {
      const r = await fetch('/api/crawler/run', { method: 'POST' })
      if (!r.ok) {
        const body = await r.json().catch(() => ({}))
        throw new Error(body.detail || `HTTP ${r.status}`)
      }
      const data = await r.json()
      setState({ status: 'ready', data })
    } catch (err) {
      setState({ status: 'error', error: String(err.message || err) })
    }
  }, [])

  // Dispara análise ao abrir.
  useEffect(() => { run() }, [run])

  // Esc fecha o modal.
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const loading = state.status === 'loading'
  const data = state.status === 'ready' ? state.data : null
  const summary = data ? summarize(data.alerts) : null

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="monitor-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="modal-head">
          <div>
            <h2 id="monitor-modal-title" className="modal-title">
              <Radar size={18} color="var(--color-accent)" />
              Monitor de menções públicas
            </h2>
            <p className="modal-subtitle">
              G1 Rio · O Dia — análise via Claude Haiku 4.5
              {data && (
                <>
                  {' · '}
                  coleta de {fmtDate(data.generated_at)} em {data.stats.duration_seconds}s
                </>
              )}
            </p>
          </div>
          <div className="modal-actions">
            <button className="btn" onClick={run} disabled={loading}>
              {loading ? <Loader2 size={14} className="spin" /> : <RefreshCw size={14} />}
              {loading ? 'Analisando…' : 'Re-analisar'}
            </button>
            <button
              type="button"
              className="modal-close"
              onClick={onClose}
              aria-label="Fechar"
            >
              <X size={18} />
            </button>
          </div>
        </header>

        <div className="modal-body">
          {loading && (
            <div className="modal-loading">
              <Loader2 size={32} className="spin" />
              <p>Coletando fontes e analisando com Claude…</p>
            </div>
          )}

          {state.status === 'error' && (
            <div className="monitor-error">
              <AlertTriangle size={14} />
              Falha no crawler: {state.error}
            </div>
          )}

          {data && (
            <>
              {Object.keys(data.stats.errors).length > 0 && (
                <div className="monitor-warning">
                  <AlertTriangle size={14} />
                  Algumas fontes falharam:{' '}
                  {Object.entries(data.stats.errors)
                    .map(([s, e]) => `${SOURCE_META[s]?.label ?? s} (${e})`)
                    .join(' · ')}
                </div>
              )}

              <div className="monitor-kpis">
                <div className="monitor-kpi">
                  <span className="monitor-kpi-value">{data.alerts.length}</span>
                  <span className="monitor-kpi-label">Alertas gerados</span>
                </div>
                <div
                  className="monitor-kpi"
                  style={{ '--kpi-accent': 'var(--color-risk-critical)' }}
                >
                  <span className="monitor-kpi-value">{summary.denuncia}</span>
                  <span className="monitor-kpi-label">Denúncias</span>
                </div>
                <div
                  className="monitor-kpi"
                  style={{ '--kpi-accent': 'var(--color-primary)' }}
                >
                  <span className="monitor-kpi-value">{summary.noticia}</span>
                  <span className="monitor-kpi-label">Notícias</span>
                </div>
                <div
                  className="monitor-kpi"
                  style={{ '--kpi-accent': 'var(--color-text-muted)' }}
                >
                  <span className="monitor-kpi-value">{summary.comentario}</span>
                  <span className="monitor-kpi-label">Comentários</span>
                </div>
              </div>

              <div className="monitor-alerts">
                {data.alerts.length === 0 && (
                  <p className="muted">
                    Nenhuma menção classificada como alerta na janela atual.
                  </p>
                )}
                {data.alerts.map((a) => {
                  const src = SOURCE_META[a.source]
                  const kindMeta = KIND_META[a.kind]
                  return (
                    <article key={a.id} className="monitor-alert-card">
                      <header className="monitor-alert-head">
                        <span
                          className="monitor-alert-kind"
                          style={{ background: kindMeta.color }}
                        >
                          {kindMeta.label}
                        </span>
                        <span className="monitor-alert-crime">{a.crime_type}</span>
                        <span className="monitor-alert-score">
                          <AlertTriangle size={11} />
                          score {a.score}
                        </span>
                        <span className="monitor-alert-source">
                          {src && <src.Icon size={12} color={src.color} />}
                          {src?.label ?? a.source}
                        </span>
                      </header>

                      <div className="monitor-alert-meta">
                        {(a.logradouro || a.bairro || a.ponto_referencia) && (
                          <span>
                            <MapPin size={11} />
                            {[a.logradouro, a.bairro, a.ponto_referencia]
                              .filter(Boolean)
                              .join(' · ')}
                          </span>
                        )}
                        {a.horario && (
                          <span>
                            <Clock size={11} />
                            {a.horario}
                          </span>
                        )}
                        {a.padrao && (
                          <span className="monitor-alert-pattern">
                            padrão: {a.padrao}
                          </span>
                        )}
                        <span className="muted">{fmtDate(a.published_at)}</span>
                        {a.url && (
                          <a
                            href={a.url}
                            target="_blank"
                            rel="noreferrer"
                            className="monitor-alert-link"
                          >
                            <ExternalLink size={11} />
                            abrir
                          </a>
                        )}
                      </div>

                      <p className="monitor-alert-text">{a.text}</p>
                    </article>
                  )
                })}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
