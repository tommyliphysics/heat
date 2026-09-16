type TabBarProps<T extends string> = {
  tabs: { id: T; label: string }[]
  active: T
  onChange: (id: T) => void
}

function TabBar<T extends string>({ tabs, active, onChange }: TabBarProps<T>) {
  return (
    <div className="tab-bar" role="tablist">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          aria-selected={tab.id === active}
          className={`tab-bar-btn${tab.id === active ? ' tab-bar-btn-active' : ''}`}
          onClick={() => onChange(tab.id)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  )
}

export default TabBar
