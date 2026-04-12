import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useState } from 'react'
import {
  LayoutDashboard,
  FolderKanban,
  Users,
  FileText,
  FileCheck,
  Layers,
  Settings,
  LogOut,
  Menu,
  X,
  BookOpen,
  ClipboardList,
  Package,
  ClipboardCheck,
  MessageSquare,
  Wrench,
} from 'lucide-react'

const mainItems = [
  { to: '/admin', icon: LayoutDashboard, label: 'Dashboard', end: true },
  { to: '/admin/projecten', icon: FolderKanban, label: 'Domeinen' },
  { to: '/admin/klanten', icon: Users, label: 'Klanten' },
]

const financeItems = [
  { to: '/admin/facturen', icon: FileText, label: 'Facturen' },
  { to: '/admin/offertes', icon: FileCheck, label: 'Offertes' },
  { to: '/admin/opdrachten', icon: ClipboardCheck, label: 'Opdrachten' },
  { to: '/admin/producten', icon: Package, label: 'Producten' },
]

const contentItems = [
  { to: '/admin/templates', icon: Layers, label: 'Templates' },
  { to: '/admin/formulieren', icon: ClipboardList, label: 'Formulieren' },
  { to: '/admin/contentpaginas', icon: BookOpen, label: "Contentpagina's" },
]

const supportItems = [
  { to: '/admin/tickets', icon: MessageSquare, label: 'Support' },
  { to: '/admin/onderhoud', icon: Wrench, label: 'Onderhoud' },
]

export default function AdminLayout() {
  const { signOut, profile } = useAuth()
  const navigate = useNavigate()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [profileMenuOpen, setProfileMenuOpen] = useState(false)

  const handleSignOut = async () => {
    await signOut()
    navigate('/login')
  }

  const closeSidebar = () => setSidebarOpen(false)

  const sidebarContent = (
    <>
      {/* Logo / Brand */}
      <div className="p-5 sm:p-6 border-b border-white/10">
        <h1 className="text-lg font-bold tracking-tight">
          <span className="text-primary-300">Design</span>Pixels
        </h1>
        <p className="text-xs text-gray-400 mt-0.5">Admin Portal</p>
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-4 px-3 overflow-y-auto">
        {[mainItems, financeItems, contentItems, supportItems].map((group, gi) => (
          <div key={gi} className={gi > 0 ? 'mt-3 pt-3 border-t border-white/10' : ''}>
            <div className="space-y-1">
              {group.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={'end' in item ? (item as { end?: boolean }).end : undefined}
                  onClick={closeSidebar}
                  className={({ isActive }) =>
                    `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                      isActive
                        ? 'bg-sidebar-active text-white'
                        : 'text-gray-300 hover:bg-sidebar-hover hover:text-white'
                    }`
                  }
                >
                  <item.icon className="w-5 h-5 flex-shrink-0" />
                  {item.label}
                </NavLink>
              ))}
            </div>
          </div>
        ))}
        </div>
      </nav>

      {/* Profile with dropdown */}
      <div className="relative border-t border-white/10">
        <button
          onClick={() => setProfileMenuOpen(!profileMenuOpen)}
          className="w-full p-4 flex items-center gap-3 hover:bg-sidebar-hover transition-colors cursor-pointer"
        >
          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-primary/40 to-primary/20 flex items-center justify-center text-sm font-semibold flex-shrink-0">
            {profile?.full_name?.charAt(0)?.toUpperCase() || 'A'}
          </div>
          <div className="overflow-hidden flex-1 text-left">
            <p className="text-sm font-medium truncate">{profile?.full_name || 'Admin'}</p>
            <p className="text-xs text-gray-400 truncate">{profile?.email}</p>
          </div>
        </button>

        {profileMenuOpen && (
          <div className="absolute bottom-full left-3 right-3 mb-1 bg-sidebar-hover rounded-lg border border-white/10 shadow-xl overflow-hidden">
            <NavLink
              to="/admin/instellingen"
              onClick={() => { closeSidebar(); setProfileMenuOpen(false) }}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 text-sm font-medium transition-colors ${
                  isActive ? 'text-white bg-white/10' : 'text-gray-300 hover:text-white hover:bg-white/5'
                }`
              }
            >
              <Settings className="w-4 h-4 flex-shrink-0" />
              Instellingen
            </NavLink>
            <button
              onClick={() => { setProfileMenuOpen(false); handleSignOut() }}
              className="flex items-center gap-3 px-3 py-2.5 text-sm font-medium text-gray-300 hover:text-white hover:bg-white/5 transition-colors w-full border-t border-white/5"
            >
              <LogOut className="w-4 h-4 flex-shrink-0" />
              Uitloggen
            </button>
          </div>
        )}
      </div>
    </>
  )

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Mobile header */}
      <div className="lg:hidden sticky top-0 z-40 bg-sidebar text-white flex items-center justify-between px-4 h-14">
        <h1 className="text-lg font-bold tracking-tight">
          <span className="text-primary-300">Design</span>Pixels
        </h1>
        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="p-2 rounded-lg hover:bg-sidebar-hover transition-colors"
        >
          {sidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </div>

      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="lg:hidden fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
          onClick={closeSidebar}
        />
      )}

      {/* Sidebar - mobile: slide-over, desktop: fixed */}
      <aside className={`
        fixed top-0 left-0 z-50 h-full w-64 bg-sidebar text-white flex flex-col transition-transform duration-300 ease-in-out
        lg:translate-x-0
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        {sidebarContent}
      </aside>

      {/* Main content */}
      <main className="lg:ml-64">
        <div className="p-4 sm:p-6 lg:p-8">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
