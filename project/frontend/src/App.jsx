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
   * Loads the real dataset from /data/real.json (already on disk).
   * Used when the ETL just finished, or as a quick path for testing.
   */
  const consumeRealJson = async () => {
    const r = await fetch('/data/real.json', { cache: 'no-store' })
    if (!r.ok) throw new Error('real.json not found')
    const payload = await r.json()
    setAreas(payload.areas)
    setSources(payload.dataSources)
    setReferenceDate(payload.referenceDate)
    setSelectedAreaId(payload.areas[0].id)
    setDataset('real')
    showToast(`Dados reais ingeridos — referência ${payload.referenceDate}`)
  }

  /**
   * On-demand pipeline: hits POST /api/build (the Vite plugin spawns
   * scripts/build_data.py), then polls GET /api/build until done, then
   * loads the freshly-written real.json.
   */
  const buildAndLoadReal = async () => {
    setLoading(true)
    try {
      const startResp = await fetch('/api/build', { method: 'POST' })
      const startBody = await startResp.json().catch(() => ({}))
      if (!startResp.ok && startResp.status !== 409) {
        const msg = startBody.message || startBody.error || `HTTP ${startResp.status}`
        setEtlState({ status: 'error', error: msg, lines: [], calls: 0, totalCalls: 27, startedAt: Date.now() })
        return
      }

      setEtlState({ status: 'running', error: null, calls: 0, totalCalls: 27, lines: [], startedAt: Date.now() })

      // Poll every 1.5s
      while (true) {
        await new Promise((r) => setTimeout(r, 1500))
        const sResp = await fetch('/api/build', { cache: 'no-store' })
        const s = await sResp.json()
        setEtlState(s)
        if (s.status === 'done') {
          await consumeRealJson()
          setTimeout(() => setEtlState(null), 800)
          break
        }
        if (s.status === 'error') break
      }
    } catch (e) {
      setEtlState({
        status: 'error',
        error: `Erro de rede: ${e.message}`,
        lines: [],
        calls: 0,
        totalCalls: 27,
        startedAt: Date.now(),
      })
    } finally {
      setLoading(false)
    }
  }

  const useMock = () => {
    setDataset('mock')
    setAreas(MOCK_AREAS)
    setSources(MOCK_SOURCES)
    setSelectedAreaId(MOCK_AREAS[0].id)
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
      <Header
        sources={sources}
        dataset={dataset}
        referenceDate={referenceDate}
        onExport={() => showToast('Relatório Analítico de Área gerado (.docx)')}
      />

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
            onExport={() => showToast(`Relatório de ${area.shortName} gerado (.docx)`)}
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
              <ActionPlan area={area} onExport={() => showToast('Plano de ação exportado para .docx')} />
            )}
          </section>
        </main>
      </div>

      {toast && <Toast message={toast} />}
    </div>
  )
}
