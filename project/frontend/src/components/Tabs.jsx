export default function Tabs({ tabs, active, onChange, badgeCounts = {} }) {
  return (
    <nav className="tabs" role="tablist">
      {tabs.map((tab) => {
        const Icon = tab.icon
        const count = tab.countKey ? badgeCounts[tab.countKey] : null
        return (
          <button
            key={tab.id}
            role="tab"
            aria-selected={active === tab.id}
            className={`tab ${active === tab.id ? 'active' : ''}`}
            onClick={() => onChange(tab.id)}
          >
            <Icon size={15} />
            {tab.label}
            {count !== null && count !== undefined && <span className="tab-badge">{count}</span>}
          </button>
        )
      })}
    </nav>
  )
}
