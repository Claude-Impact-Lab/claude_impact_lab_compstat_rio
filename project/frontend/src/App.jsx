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

  const area = useMemo(
    () => areas.find((a) => a.id === selectedAreaId) ?? areas[0],
    [areas, selectedAreaId],
  )

  const showToast = (msg) => {
    setToast(msg)
    setTimeout(() => setToast(null), 2400)
  }

  /**
   * Loads the pre-processed real dataset from /data/real.json (committed
   * during the ETL step). Falls back to mock data if the file is missing —
   * useful when running the frontend standalone.
   */
  const loadRealData = async (modeLabel) => {
    setLoading(true)
    try {
      const r = await fetch('/data/real.json', { cache: 'no-store' })
      if (!r.ok) throw new Error('real.json not found')
      const payload = await r.json()
      setAreas(payload.areas)
      setSources(payload.dataSources)
      setReferenceDate(payload.referenceDate)
      setSelectedAreaId(payload.areas[0].id)
      setDataset('real')
      showToast(`Dados reais ingeridos — referência ${payload.referenceDate}`)
    } catch (e) {
      console.warn('Falling back to mock data:', e)
      setDataset('mock')
      showToast('real.json não encontrado — usando dados mockados')
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
      <UploadScreen
        loading={loading}
        onContinue={() => loadRealData('upload')}
        onUseDemo={() => loadRealData('demo')}
        onUseMock={useMock}
      />
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
