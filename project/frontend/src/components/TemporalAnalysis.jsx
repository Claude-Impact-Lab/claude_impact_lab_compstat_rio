import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  LineChart, Line,
} from 'recharts'
import { Clock, Flame } from 'lucide-react'

export default function TemporalAnalysis({ area }) {
  const { byDay, byHour } = area.temporal

  return (
    <div>
      <div className="panel-section">
        <div className="peak-callout">
          <div className="peak-callout-icon">
            <Flame size={18} />
          </div>
          <div className="peak-callout-text">
            Pico identificado em <span className="peak-callout-strong">{area.peakHours}</span>,
            principalmente <span className="peak-callout-strong">{area.peakDays}</span>.
            Recomenda-se alinhar a QMD da FM e os reforços operacionais a esta janela.
          </div>
        </div>

        <div className="section-header">
          <h3 className="section-title">
            <Clock size={16} color="var(--color-accent)" />
            Distribuição temporal — Roubos e furtos
          </h3>
          <span className="muted" style={{ fontSize: 12 }}>
            Base: ocorrências dos últimos 90 dias
          </span>
        </div>

        <div className="chart-row">
          <div>
            <p className="section-subtitle">Por dia da semana</p>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={byDay} margin={{ top: 8, right: 16, left: -16, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="day" stroke="#64748b" fontSize={12} />
                <YAxis stroke="#64748b" fontSize={12} />
                <Tooltip
                  contentStyle={{ borderRadius: 8, fontSize: 12, border: '1px solid #e2e8f0' }}
                  cursor={{ fill: 'rgba(30, 58, 95, 0.05)' }}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="Roubo" fill="#dc2626" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Furto" fill="#0ea5e9" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div>
            <p className="section-subtitle">Por faixa horária</p>
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={byHour} margin={{ top: 8, right: 16, left: -16, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="hour" stroke="#64748b" fontSize={11} interval={2} />
                <YAxis stroke="#64748b" fontSize={12} />
                <Tooltip
                  contentStyle={{ borderRadius: 8, fontSize: 12, border: '1px solid #e2e8f0' }}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Line type="monotone" dataKey="Roubo" stroke="#dc2626" strokeWidth={2} dot={{ r: 2 }} />
                <Line type="monotone" dataKey="Furto" stroke="#0ea5e9" strokeWidth={2} dot={{ r: 2 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="panel-section">
        <h3 className="section-title">Recomendações temporais geradas por IA</h3>
        <p className="section-subtitle">Cruzamento entre picos identificados e a QMD atual da FM.</p>
        <ul style={{ paddingLeft: 18, margin: 0, fontSize: 13, lineHeight: 1.8 }}>
          <li>
            Reforço a pé na janela <strong>{area.peakHours}</strong>, com prioridade para os hotspots identificados no
            Heatmap.
          </li>
          <li>
            Considerar uma dupla motorizada no entorno do polígono nos dias <strong>{area.peakDays}</strong>.
          </li>
          <li>
            Articular SMAS/RioLuz/Comlurb para resolução dos fatores ambientais antes da janela crítica diária.
          </li>
        </ul>
      </div>
    </div>
  )
}
