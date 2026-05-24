import { useRef, useState } from 'react'
import {
  Shield,
  MapPin,
  MessageSquare,
  Building2,
  Video,
  FileText,
  Map as MapIcon,
  UploadCloud,
  CheckCircle2,
  ArrowRight,
  Sparkles,
  X,
  AlertCircle,
} from 'lucide-react'

/**
 * Each source describes one of the 5 data inputs from CompStat Municipal,
 * plus the supporting RELINTs and FM polygon shapefile. `required` flags
 * the inputs needed before the dashboard can be opened.
 */
const SOURCES = [
  {
    id: 'ocorrencias',
    icon: MapPin,
    title: 'Ocorrências Criminais',
    subtitle: 'Furtos e roubos georreferenciados',
    accept: '.csv',
    multiple: false,
    expectedFile: 'df_ocorrencias_tratado.csv',
    color: '#dc2626',
    required: true,
    usage:
      'Base quantitativa da mancha criminal. Alimenta o heatmap, a análise temporal (dia/hora) e o cálculo das coincidências de alto risco.',
    fields: ['data', 'hora', 'delito', 'latitude/longitude', 'bairro', 'AISP'],
  },
  {
    id: 'denuncias',
    icon: MessageSquare,
    title: 'Disque Denúncia',
    subtitle: 'Denúncias anônimas qualificadas',
    accept: '.csv',
    multiple: false,
    expectedFile: 'disk_denuncia.csv',
    color: '#0ea5e9',
    required: true,
    usage:
      'Camada qualitativa da dinâmica criminal: modus operandi, perfil de suspeitos, rotas de fuga e pontos de receptação. Alimenta o módulo de Dinâmica Criminal.',
    fields: ['data_denúncia', 'classe/tipo', 'relato', 'latitude/longitude', 'envolvidos'],
  },
  {
    id: 'fatores',
    icon: Building2,
    title: 'Fatores Urbanos',
    subtitle: 'Levantamento ambiental de campo',
    accept: '.csv',
    multiple: false,
    expectedFile: 'fatores_urbanos.csv',
    color: '#16a34a',
    required: true,
    usage:
      'Mapeamento de iluminação, vegetação, comércio irregular, calçadas, esconderijos e PSR — com o órgão responsável pela resolução. Cruzado com a mancha criminal nas Coincidências.',
    fields: ['tipo_ocorrencia', 'orgao_responsavel', 'logradouro', 'coordenadas'],
  },
  {
    id: 'relints',
    icon: FileText,
    title: 'RELINTs',
    subtitle: 'Relatórios de Inteligência da FM',
    accept: '.docx,.pdf',
    multiple: true,
    expectedFile: 'RI_*.docx (até 8 arquivos)',
    color: '#7c3aed',
    required: true,
    usage:
      'Documentos qualitativos da Força Municipal. A IA sintetiza modus operandi, perfis, rotas de fuga e pontos de receptação para o relatório analítico.',
    fields: ['texto narrativo por área', 'data', 'autor'],
  },
  {
    id: 'poligonos',
    icon: MapIcon,
    title: 'Polígonos da FM',
    subtitle: 'Áreas de atuação da Força Municipal',
    accept: '.shp,.shx,.dbf,.prj,.cpg,.qmd,.geojson,.zip',
    multiple: true,
    expectedFile: 'areas_forca_municipal.shp + arquivos auxiliares',
    color: '#1e3a5f',
    required: true,
    usage:
      'Delimita as 22 áreas prioritárias. Define o recorte territorial de cada relatório e identifica lacunas operacionais.',
    fields: ['geometria (polygon)', 'nome_area', 'identificador'],
  },
  {
    id: 'cameras',
    icon: Video,
    title: 'Câmeras de Monitoramento',
    subtitle: 'Localização das câmeras nas áreas FM',
    accept: '.csv',
    multiple: false,
    expectedFile: 'cameras_areas_fm.csv',
    color: '#0f172a',
    required: false,
    usage:
      'Complementar — sobreposta ao heatmap para identificar pontos cegos (hotspots sem câmera) e orientar reposicionamento.',
    fields: ['id_ponto', 'nome_area_fm', 'geometry (POINT)'],
  },
]

export default function UploadScreen({ onContinue, onUseDemo, onUseMock, loading }) {
  const [uploads, setUploads] = useState({})

  const setFiles = (id, fileList) => {
    if (!fileList || fileList.length === 0) return
    const files = Array.from(fileList)
    setUploads((prev) => ({
      ...prev,
      [id]: {
        files,
        // Sum of sizes in bytes — used for the "X MB" label
        totalBytes: files.reduce((s, f) => s + f.size, 0),
      },
    }))
  }

  const clearUpload = (id) => {
    setUploads((prev) => {
      const next = { ...prev }
      delete next[id]
      return next
    })
  }

  const requiredCount = SOURCES.filter((s) => s.required).length
  const requiredDone = SOURCES.filter((s) => s.required && uploads[s.id]).length
  const totalDone = Object.keys(uploads).length
  const allRequiredReady = requiredDone === requiredCount

  return (
    <div className="upload-screen">
      <header className="upload-header">
        <div className="upload-header-inner">
          <div className="header-brand">
            <div className="header-logo">
              <Shield size={20} color="white" />
            </div>
            <div>
              <h1 className="header-title">CompStat Rio</h1>
              <p className="header-subtitle">Plataforma de Inteligência Criminal da Prefeitura do Rio de Janeiro</p>
            </div>
          </div>
        </div>
      </header>

      <main className="upload-main">
        <section className="upload-hero">
          <div className="upload-hero-eyebrow">
            <Sparkles size={14} />
            Etapa 1 de 2 — Ingestão dos dados
          </div>
          {/* <h2 className="upload-hero-title">
            Carregue as 5 fontes do CompStat Municipal
          </h2> */}
          <p className="upload-hero-text">
            A plataforma integra e normaliza automaticamente as fontes do CompStat para cruzar a mancha criminal
            com fatores urbanos e dinâmica criminal, identificar coincidências de alto risco e gerar os
            <strong> Relatórios Analíticos de Área </strong>.
            Faça o upload dos arquivos abaixo, cada um alimenta um módulo específico da análise.
          </p>

          <div className="upload-progress">
            <div className="upload-progress-track">
              <div
                className="upload-progress-fill"
                style={{ width: `${(requiredDone / requiredCount) * 100}%` }}
              />
            </div>
            <div className="upload-progress-label">
              <strong>{requiredDone}/{requiredCount}</strong> fontes carregadas
              {totalDone > requiredDone && (
                <span className="muted"> · +{totalDone - requiredDone} opcional</span>
              )}
            </div>
          </div>
        </section>

        <section className="upload-grid">
          {SOURCES.map((source) => (
            <SourceCard
              key={source.id}
              source={source}
              upload={uploads[source.id]}
              onUpload={(files) => setFiles(source.id, files)}
              onClear={() => clearUpload(source.id)}
            />
          ))}
        </section>

        <footer className="upload-footer">
          <div className="upload-footer-info">
            {!allRequiredReady ? (
              <span className="upload-footer-warning">
                {/* <CheckCircle2 size={14} /> */}
                {/* Faltam {requiredCount - requiredDone} fonte{requiredCount - requiredDone !== 1 ? 's' : ''} obrigatória{requiredCount - requiredDone !== 1 ? 's' : ''} para iniciar a análise */}
              </span>
            ) : (
              <span className="upload-footer-ready">
                {/* <CheckCircle2 size={14} /> */}
                {/* Tudo pronto. Os dados serão ingeridos, normalizados e integrados ao iniciar a análise. */}
              </span>
            )}
          </div>

          <div className="upload-footer-actions">
            {onUseMock && (
              <button className="btn" onClick={onUseMock} disabled={loading} title="Pula a ingestão e usa dados sintéticos">
                Pular (mock)
              </button>
            )}
            <button className="btn" onClick={onUseDemo} disabled={loading} title="Carrega o JSON pré-processado a partir de /dados/">
              <Sparkles size={14} />
              {loading ? 'Carregando…' : 'Usar dados disponibilizados para o projeto'}
            </button>
            <button
              className="btn btn-primary"
              disabled={!allRequiredReady || loading}
              onClick={onContinue}
            >
              {loading ? 'Ingerindo…' : 'Iniciar análise'}
              <ArrowRight size={14} />
            </button>
          </div>
        </footer>
      </main>
    </div>
  )
}

// ---------------------------------------------------------------------------
// SourceCard
// ---------------------------------------------------------------------------

function SourceCard({ source, upload, onUpload, onClear }) {
  const inputRef = useRef(null)
  const [isDragOver, setIsDragOver] = useState(false)
  const Icon = source.icon
  const isUploaded = Boolean(upload)

  const onDrop = (e) => {
    e.preventDefault()
    setIsDragOver(false)
    onUpload(e.dataTransfer.files)
  }

  return (
    <article className={`source-card ${isUploaded ? 'uploaded' : ''}`}>
      <header className="source-card-header">
        <div className="source-card-icon" style={{ background: `${source.color}1a`, color: source.color }}>
          <Icon size={20} />
        </div>
        <div className="source-card-titles">
          <h3 className="source-card-title">
            {source.title}
            {!source.required && <span className="source-optional-pill">opcional</span>}
          </h3>
          <p className="source-card-subtitle">{source.subtitle}</p>
        </div>
        {isUploaded && (
          <div className="source-card-check" title="Arquivo carregado">
            <CheckCircle2 size={20} />
          </div>
        )}
      </header>

      <div className="source-card-body">
        <p className="source-card-usage">{source.usage}</p>

        <div className="source-card-fields">
          <span className="source-card-fields-label">Campos esperados:</span>
          {source.fields.map((f) => (
            <span className="source-card-field" key={f}>{f}</span>
          ))}
        </div>
      </div>

      {!isUploaded ? (
        <label
          className={`drop-zone ${isDragOver ? 'drag-over' : ''}`}
          onDragOver={(e) => { e.preventDefault(); setIsDragOver(true) }}
          onDragLeave={() => setIsDragOver(false)}
          onDrop={onDrop}
        >
          <input
            ref={inputRef}
            type="file"
            accept={source.accept}
            multiple={source.multiple}
            onChange={(e) => onUpload(e.target.files)}
            hidden
          />
          <UploadCloud size={20} style={{ color: source.color }} />
          <span className="drop-zone-primary">
            Arraste o arquivo ou <span className="drop-zone-link">selecione</span>
          </span>
          <span className="drop-zone-meta">
            Esperado: <code>{source.expectedFile}</code>
          </span>
        </label>
      ) : (
        <div className="upload-result">
          <div className="upload-result-info">
            <div className="upload-result-strong">
              {upload.files.length === 1
                ? upload.files[0].name
                : `${upload.files.length} arquivos`}
            </div>
            <div className="upload-result-meta">
              {formatBytes(upload.totalBytes)} · pronto para ingestão
            </div>
          </div>
          <button className="upload-result-clear" onClick={onClear} title="Remover">
            <X size={14} />
          </button>
        </div>
      )}
    </article>
  )
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}
