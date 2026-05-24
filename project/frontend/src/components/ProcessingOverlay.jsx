import { Loader2, Sparkles, AlertCircle, CheckCircle2 } from 'lucide-react'

const PHASE_LABELS = {
  starting:        'Iniciando ETL…',
  'load-polygons': 'Carregando polígonos das áreas FM',
  'load-cameras':  'Carregando câmeras',
  'load-ocorrencias': 'Processando ocorrências criminais (90d)',
  'load-denuncias': 'Processando Disque Denúncia (90d)',
  'load-fatores':  'Processando fatores urbanos ativos',
  'load-relints':  'Lendo RELINTs',
  llm:             'Sintetizando análise com Claude Opus 4.7',
  wrote:           'Finalizando…',
  idle:            'Aguardando',
}

const SECTION_LABELS = {
  'resumo executivo':  'resumo executivo',
  'dinâmica criminal': 'dinâmica criminal',
  'plano de ação':     'plano de ação',
}

export default function ProcessingOverlay({ state }) {
  if (!state) return null
  const { status, calls, totalCalls, areaCurrent, sectionCurrent, phase, lines, error } = state
  const pct = totalCalls > 0 ? Math.min(100, Math.round((calls / totalCalls) * 100)) : 0
  const elapsed = state.startedAt ? Math.round((Date.now() - state.startedAt) / 1000) : 0

  const isError = status === 'error'
  const isDone = status === 'done'

  return (
    <div className="processing-overlay">
      <div className="processing-card">
        <div className="processing-header">
          {isError ? (
            <AlertCircle size={22} color="#dc2626" />
          ) : isDone ? (
            <CheckCircle2 size={22} color="#16a34a" />
          ) : (
            <Loader2 size={22} className="spin" color="#0ea5e9" />
          )}
          <div>
            <h2 className="processing-title">
              {isError ? 'Falha no processamento'
                : isDone ? 'Concluído'
                : 'Processando dados'}
            </h2>
            <p className="processing-subtitle">
              {isError
                ? error || 'Erro desconhecido'
                : isDone
                ? `Síntese completa em ${elapsed}s — abrindo dashboard…`
                : 'O ETL está rodando localmente e chamando Claude Opus 4.7 — pode levar de 3 a 5 minutos.'}
            </p>
          </div>
        </div>

        {!isError && (
          <>
            <div className="processing-progress">
              <div className="processing-progress-bar">
                <div
                  className="processing-progress-fill"
                  style={{ width: `${pct}%` }}
                />
              </div>
              <div className="processing-progress-meta">
                <strong>{calls}/{totalCalls}</strong> chamadas LLM concluídas
                {pct > 0 && <span className="muted"> · {pct}%</span>}
                <span className="muted"> · {elapsed}s decorridos</span>
              </div>
            </div>

            <div className="processing-current">
              <Sparkles size={14} />
              <div>
                <div className="processing-current-phase">
                  {PHASE_LABELS[phase] || phase}
                </div>
                {phase === 'llm' && areaCurrent && (
                  <div className="processing-current-detail">
                    Área: <strong>{areaCurrent}</strong>
                    {sectionCurrent && (
                      <> · {SECTION_LABELS[sectionCurrent] || sectionCurrent}</>
                    )}
                  </div>
                )}
              </div>
            </div>
          </>
        )}

        {lines && lines.length > 0 && (
          <details className="processing-log" open={isError}>
            <summary>
              Log do ETL <span className="muted">(últimas {lines.length} linhas)</span>
            </summary>
            <pre className="processing-log-pre">
              {lines.join('\n')}
            </pre>
          </details>
        )}
      </div>
    </div>
  )
}
