import { useEffect, useMemo, useState } from 'react'
import { MapContainer, TileLayer, Polygon, CircleMarker, Tooltip, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet.heat'
import { Flame, AlertOctagon, Video } from 'lucide-react'

/**
 * leaflet.heat does not ship a React component, so we drive it imperatively.
 * The layer is re-created whenever the points change.
 */
function HeatLayer({ points, visible }) {
  const map = useMap()

  useEffect(() => {
    if (!visible) return
    const layer = L.heatLayer(points, {
      radius: 28,
      blur: 22,
      maxZoom: 17,
      max: 1,
      minOpacity: 0.35,
      gradient: {
        0.1: '#1e3a8a',
        0.3: '#06b6d4',
        0.5: '#22c55e',
        0.7: '#eab308',
        0.9: '#ef4444',
      },
    }).addTo(map)
    return () => {
      map.removeLayer(layer)
    }
  }, [map, points, visible])

  return null
}

/** Centers the map on the selected area when it changes. */
function MapFocus({ center, zoom }) {
  const map = useMap()
  useEffect(() => {
    map.setView(center, zoom, { animate: true })
  }, [map, center, zoom])
  return null
}

const FACTOR_COLOR = {
  Comlurb:    '#16a34a',
  RioLuz:     '#eab308',
  SEOP:       '#7c3aed',
  Seconserva: '#db2777',
  SMAS:       '#e11d48',
  'CET-Rio':  '#0891b2',
  'GM-Rio':   '#4338ca',
  SMTR:       '#9333ea',
}

export default function HeatmapView({ area }) {
  const [layers, setLayers] = useState({
    heat: true,
    polygon: true,
    factors: true,
    cameras: true,
  })

  const toggle = (key) => setLayers((l) => ({ ...l, [key]: !l[key] }))

  const factorsByOrgao = useMemo(() => {
    const groups = {}
    for (const f of area.urbanFactors) {
      groups[f.orgao] = (groups[f.orgao] ?? 0) + 1
    }
    return groups
  }, [area])

  return (
    <div>
      <div className="panel-section">
        <div className="section-header">
          <h3 className="section-title">
            <Flame size={16} color="var(--color-risk-critical)" />
            Mapa de calor — concentração de roubos e furtos
          </h3>
          <span className="muted" style={{ fontSize: 12 }}>
            {area.crimePoints.length} ocorrências mapeadas (últimos 90 dias)
          </span>
        </div>
        <p className="section-subtitle">
          Sobreposição de mancha criminal, polígono operacional da FM, fatores urbanos por órgão responsável e câmeras
          existentes. Use os controles do mapa para isolar camadas.
        </p>

        <div className="map-container">
          <MapContainer
            center={area.center}
            zoom={area.zoom}
            scrollWheelZoom
            style={{ height: '100%', width: '100%' }}
          >
            <TileLayer
              attribution='&copy; OpenStreetMap'
              url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
            />

            <MapFocus center={area.center} zoom={area.zoom} />

            {layers.polygon && (
              <Polygon
                positions={area.polygon}
                pathOptions={{
                  color: '#1e3a5f',
                  weight: 2,
                  fillColor: '#1e3a5f',
                  fillOpacity: 0.06,
                  dashArray: '6 4',
                }}
              >
                <Tooltip sticky>Polígono FM — {area.shortName}</Tooltip>
              </Polygon>
            )}

            {layers.heat && <HeatLayer points={area.crimePoints} visible={layers.heat} />}

            {layers.factors && area.urbanFactors.map((f, i) => (
              <CircleMarker
                key={`f-${i}`}
                center={[f.lat, f.lng]}
                radius={6}
                pathOptions={{
                  color: FACTOR_COLOR[f.orgao] ?? '#475569',
                  fillColor: FACTOR_COLOR[f.orgao] ?? '#475569',
                  fillOpacity: 0.85,
                  weight: 2,
                }}
              >
                <Tooltip>
                  <strong>{f.type}</strong>
                  <br />Categoria: {f.category}
                  <br />Responsável: {f.orgao}
                </Tooltip>
              </CircleMarker>
            ))}

            {layers.cameras && area.cameras.map((c, i) => (
              <CircleMarker
                key={`c-${i}`}
                center={c}
                radius={5}
                pathOptions={{
                  color: '#0f172a',
                  fillColor: 'white',
                  fillOpacity: 1,
                  weight: 2,
                }}
              >
                <Tooltip>Câmera de monitoramento</Tooltip>
              </CircleMarker>
            ))}
          </MapContainer>

          <div className="map-controls">
            <div className="map-controls-title">Camadas</div>
            <LayerToggle label="Heatmap (ocorrências)" color="linear-gradient(90deg,#1e3a8a,#22c55e,#ef4444)"
              checked={layers.heat} onChange={() => toggle('heat')} />
            <LayerToggle label="Polígono FM" color="#1e3a5f"
              checked={layers.polygon} onChange={() => toggle('polygon')} />
            <LayerToggle label="Fatores urbanos" color="#7c3aed"
              checked={layers.factors} onChange={() => toggle('factors')} />
            <LayerToggle label="Câmeras" color="white" border="#0f172a"
              checked={layers.cameras} onChange={() => toggle('cameras')} />
          </div>

          <div className="map-legend">
            <span className="muted">Baixa</span>
            <div className="legend-gradient" />
            <span className="muted">Alta</span>
          </div>
        </div>

        <div className="evidence-strip">
          <strong>Fatores urbanos no polígono:</strong>
          {Object.entries(factorsByOrgao).map(([orgao, n]) => (
            <span key={orgao} className="evidence-tag">
              <span style={{
                display: 'inline-block', width: 8, height: 8, borderRadius: 2,
                background: FACTOR_COLOR[orgao] ?? '#475569',
              }} />
              {orgao}: {n}
            </span>
          ))}
          <span className="evidence-tag">
            <Video size={11} /> Câmeras: {area.cameras.length}
          </span>
          <span className="evidence-tag">
            <AlertOctagon size={11} color="var(--color-risk-critical)" /> {area.kpis.coincidencias} coincidências críticas
          </span>
        </div>
      </div>
    </div>
  )
}

function LayerToggle({ label, color, border, checked, onChange }) {
  return (
    <label className="layer-toggle">
      <input type="checkbox" checked={checked} onChange={onChange} />
      <span
        className="layer-color"
        style={{
          background: color,
          border: border ? `1.5px solid ${border}` : 'none',
        }}
      />
      {label}
    </label>
  )
}
