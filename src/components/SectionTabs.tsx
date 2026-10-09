import { NavLink, Outlet } from 'react-router-dom'

export interface SectionTab {
  to: string
  label: string
}

// Onderdelen die samen één menu-item vormen (bijv. Support: tickets en chatgesprekken).
// Elk tabblad houdt zijn eigen adres, zodat bestaande links blijven werken.
export default function SectionTabs({ tabs }: { tabs: SectionTab[] }) {
  return (
    <>
      <div className="mb-6 flex gap-1 overflow-x-auto border-b border-gray-200">
        {tabs.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            className={({ isActive }) =>
              `-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
                isActive
                  ? 'border-primary text-primary'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`
            }
          >
            {tab.label}
          </NavLink>
        ))}
      </div>
      <Outlet />
    </>
  )
}
