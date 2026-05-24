import { useState } from 'react'
import { Shield, Radar } from 'lucide-react'

import MonitorWebModal from './MonitorWebModal.jsx'

/**
 * Header enxuto: marca à esquerda, único botão "Monitorar Web" à direita.
 * O botão abre o modal de análise web (que auto-roda o crawler).
 */
export default function Header() {
  const [open, setOpen] = useState(false)

  return (
    <>
      <header className="header">
        <div className="header-brand">
          <div className="header-logo">
            <Shield size={20} color="white" />
          </div>
          <div>
            <h1 className="header-title">CompStat Rio</h1>
            <p className="header-subtitle">
              Plataforma de Inteligência Criminal — Prefeitura do Rio de Janeiro
            </p>
          </div>
        </div>

        <div className="header-actions">
          <button className="btn btn-accent" onClick={() => setOpen(true)}>
            <Radar size={14} />
            Monitorar Web
          </button>
        </div>
      </header>

      {open && <MonitorWebModal onClose={() => setOpen(false)} />}
    </>
  )
}
