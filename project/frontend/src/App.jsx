import { useMemo, useState } from 'react'
import {
  FileText,
  Map as MapIcon,
  Clock,
  Brain,
  Layers,
  ListChecks,
} from 'lucide-react'

import { AREAS as MOCK_AREAS, DATA_SOURCES as MOCK_SOURCES } from './data/mock.js'
import Header from './components/Header.jsx'
import Sidebar from './components/Sidebar.jsx'
import AreaHeader from './components/AreaHeader.jsx'
import Tabs from './components/Tabs.jsx'
import ExecutiveSummary from './components/ExecutiveSummary.jsx'
import HeatmapView from './components/HeatmapView.jsx'
import TemporalAnalysis from './components/TemporalAnalysis.jsx'
import CriminalDynamics from './components/CriminalDynamics.jsx'
import CoincidencePanel from './components/CoincidencePanel.jsx'
import ActionPlan from './components/ActionPlan.jsx'
import Toast from './components/Toast.jsx'
import UploadScreen from './components/UploadScreen.jsx'
import ProcessingOverlay from './components/ProcessingOverlay.jsx'

const TABS = [
  { id: 'resumo',        label: 'Resumo Executivo',  icon: FileText,   countKey: null },
  { id: 'heatmap',       label: 'Heatmap',           icon: MapIcon,    countKey: null },
  { id: 'temporal',      label: 'Análise Temporal',  icon: Clock,      countKey: null },
  { id: 'dinamica',      label: 'Dinâmica Criminal', icon: Brain,      countKey: null },
  { id: 'coincidencias', label: 'Coincidências',     icon: Layers,     countKey: 'coincidencias' },
  { id: 'plano',         label: 'Plano de Ação',     icon: ListChecks, countKey: null },
]

export default function App() {
  // dataset: 'mock' | 'real' — chosen at the upload screen.
  // areas / sources hold the active data being rendered.
  const [dataset, setDataset] = useState(null)
  const [areas, setAreas] = useState(MOCK_AREAS)
  const [sources, setSources] = useState(MOCK_SOURCES)
  const [referenceDate, setReferenceDate] = useState(null)
  const [loading, setLoading] = useState(false)

  const [selectedAreaId, setSelectedAreaId] = useState(MOCK_AREAS[0].id)
  const [activeTab, setActiveTab] = useState('resumo')
  const [toast, setToast] = useState(null)
  // Live state of the on-demand ETL job (null when not running).
  const [etlState, setEtlState] = useState(null)

  const area = useMemo(
    () => areas.find((a) => a.id === selectedAreaId) ?? areas[0],
    [areas, selectedAreaId],
  )

  const showToast = (msg) => {
    setToast(msg)
    setTimeout(() => setToast(null), 2400)
  }

  /**
   * Carrega o payload final do backend (GET /api/build/result). Chamado
   * automaticamente quando o stream SSE emite `done`. Substitui o antigo
   * fetch de /data/real.json — não há mais arquivo em disco.
   */
  const consumeRealJson = async () => {
    const r = await fetch('/api/build/result', { cache: 'no-store' })
    if (!r.ok) throw new Error(`/api/build/result HTTP ${r.status}`)
    const payload = await r.json()
    setAreas(payload.areas)
    setSources(payload.dataSources)
    setReferenceDate(payload.referenceDate)
    setSelectedAreaId(payload.areas[0].id)
    setDataset('real')
    showToast(`Dados reais ingeridos — referência ${payload.referenceDate}`)
  }

  /**
   * Pipeline on-demand: POST /api/build/run para iniciar o ETL no FastAPI
   * (project/backend/etl/build_data.py), assina o stream SSE em
   * /api/build/stream para progresso ao vivo, e ao receber `done` busca o
   * payload em /api/build/result.
   */
  const buildAndLoadReal = async () => {
    setLoading(true)
    setEtlState({
      status: 'running', error: null,
      calls: 0, totalCalls: 27,
      areaCurrent: null, sectionCurrent: null,
      phase: 'starting', lines: [],
      startedAt: Date.now(),
    })

    let started = false
    try {
      const startResp = await fetch('/api/build/run', { method: 'POST' })
      // 409 = job já estava rodando — OK, basta assinar o stream existente.
      if (!startResp.ok && startResp.status !== 409) {
        const body = await startResp.json().catch(() => ({}))
        const msg = body.detail || body.message || `HTTP ${startResp.status}`
        setEtlState((s) => ({ ...s, status: 'error', error: msg }))
        setLoading(false)
        return
      }
      started = true
    } catch (e) {
      setEtlState((s) => ({ ...s, status: 'error', error: `Erro de rede: ${e.message}` }))
      setLoading(false)
      return
    }

    if (!started) return

    const es = new EventSource('/api/build/stream')

    es.addEventListener('phase', (e) => {
      const ev = JSON.parse(e.data)
      setEtlState((s) => ({ ...s, phase: ev.phase }))
    })

    es.addEventListener('llm', (e) => {
      const ev = JSON.parse(e.data)
      setEtlState((s) => ({
        ...s, phase: 'llm',
        calls: ev.index, totalCalls: ev.total,
        areaCurrent: ev.area, sectionCurrent: ev.section,
      }))
    })

    es.addEventListener('log', (e) => {
      const ev = JSON.parse(e.data)
      setEtlState((s) => ({
        ...s,
        lines: [...(s.lines || []).slice(-24), ev.line],
      }))
    })

    es.addEventListener('done', async () => {
      es.close()
      try {
        await consumeRealJson()
        setEtlState((s) => ({ ...s, status: 'done' }))
        setTimeout(() => setEtlState(null), 800)
      } catch (err) {
        setEtlState((s) => ({
          ...s, status: 'error',
          error: `ETL terminou mas falhou ao carregar payload: ${err.message}`,
        }))
      } finally {
        setLoading(false)
      }
    })

    // `error` aqui pode ser o evento `error` do backend (com data JSON) ou
    // uma falha de conexão do EventSource (sem data). Tratamos os dois.
    es.addEventListener('error', (e) => {
      // EventSource fecha sozinho em rede caída; só sinalizamos se ainda não terminou.
      const data = e.data ? (() => { try { return JSON.parse(e.data) } catch { return {} } })() : null
      if (data && data.message) {
        es.close()
        setEtlState((s) => ({ ...s, status: 'error', error: data.message }))
        setLoading(false)
      } else if (es.readyState === EventSource.CLOSED) {
        setEtlState((s) =>
          s?.status === 'done' || s?.status === 'error'
            ? s
            : { ...s, status: 'error', error: 'Conexão SSE interrompida' },
        )
        setLoading(false)
      }
    })
  }

  const useMock = () => {
    setDataset('mock')
    setAreas(MOCK_AREAS)
    setSources(MOCK_SOURCES)
    setSelectedAreaId(MOCK_AREAS[0].id)
  }

  /**
   * POST /api/report → recebe .docx do backend e dispara download no browser.
   * Aplicado nos botões "Exportar Relatório" (header da área) e "Exportar .docx"
   * (plano de ação).
   */
  const exportAreaReport = async (targetArea) => {
    showToast(`Gerando relatório de ${targetArea.shortName}…`)
    try {
      const resp = await fetch('/api/report', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ area: targetArea, referenceDate }),
      })
      if (!resp.ok) {
        const body = await resp.json().catch(() => ({}))
        throw new Error(body.detail || `HTTP ${resp.status}`)
      }
      const blob = await resp.blob()
      const filename = (resp.headers.get('content-disposition') || '')
        .match(/filename="([^"]+)"/)?.[1]
        ?? `compstat_relatorio_${targetArea.id}.docx`
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
      showToast(`Relatório de ${targetArea.shortName} baixado (.docx)`)
    } catch (e) {
      console.error('export failed:', e)
      showToast(`Falha ao gerar relatório: ${e.message}`)
    }
  }

  if (dataset === null) {
    return (
      <>
        <UploadScreen
          loading={loading}
          onContinue={buildAndLoadReal}
          onUseDemo={buildAndLoadReal}
          onUseMock={useMock}
        />
        {etlState && <ProcessingOverlay state={etlState} />}
      </>
    )
  }

  return (
    <div className="app">
      <Header />

      <div className="app-body">
        <Sidebar
          areas={areas}
          selectedId={selectedAreaId}
          onSelect={(id) => {
            setSelectedAreaId(id)
            setActiveTab('resumo')
          }}
        />

        <main className="main">
          <AreaHeader
            area={area}
            onExport={() => exportAreaReport(area)}
          />

          <Tabs
            tabs={TABS}
            active={activeTab}
            onChange={setActiveTab}
            badgeCounts={{ coincidencias: area.kpis.coincidencias }}
          />

          <section className="panel">
            {activeTab === 'resumo' && <ExecutiveSummary area={area} />}
            {activeTab === 'heatmap' && <HeatmapView area={area} />}
            {activeTab === 'temporal' && <TemporalAnalysis area={area} />}
            {activeTab === 'dinamica' && <CriminalDynamics area={area} />}
            {activeTab === 'coincidencias' && <CoincidencePanel area={area} />}
            {activeTab === 'plano' && (
              <ActionPlan area={area} onExport={() => exportAreaReport(area)} />
            )}
          </section>
        </main>
      </div>

      {toast && <Toast message={toast} />}
    </div>
  )
}
