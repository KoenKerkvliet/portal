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
} from 'lucide-react'

const navItems = [
  { to: '/admin', icon: LayoutDashboard, label: 'Dashboard', end: true },
  { to: '/admin/projecten', icon: FolderKanban, label: 'Domeinen' },
  { to: '/admin/klanten', icon: Users, label: 'Klanten' },
  { to: '/admin/facturen', icon: FileText, label: 'Facturen' },
  { to: '/admin/offertes', icon: FileCheck, label: 'Offertes' },
  { to: '/admin/opdrachten', icon: ClipboardCheck, label: 'Opdrachten' },
  { to: '/admin/producten', icon: Package, label: 'Producten' },
  { to: '/admin/templates', icon: Layers, label: 'Templates' },
]

const contentItems = [
  { to: '/admin/formulieren', icon: ClipboardList, label: 'Formulieren' },
]

export default function AdminLayout() {
  const { signOut, profile } = useAuth()
  const navigate = useNavigate()
  const [sidebarOpen, setSidebarOpen] = useState(false)

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
        <div className="space-y-1">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
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

        {/* Content group */}
        <div className="mt-6 pt-4 border-t border-white/10">
          <div className="flex items-center gap-2 px-3 mb-2">
            <BookOpen className="w-3.5 h-3.5 text-gray-500" />
            <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Content</span>
          </div>
          <div className="space-y-1">
            {contentItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
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
      </nav>

      {/* Bottom section */}
      <div className="p-3 border-t border-white/10 space-y-1">
        <NavLink
          to="/admin/instellingen"
          onClick={closeSidebar}
          className={({ isActive }) =>
            `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
              isActive
                ? 'bg-sidebar-active text-white'
                : 'text-gray-300 hover:bg-sidebar-hover hover:text-white'
            }`
          }
        >
          <Settings className="w-5 h-5 flex-shrink-0" />
          Instellingen
        </NavLink>

        <button
          onClick={handleSignOut}
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-gray-300 hover:bg-sidebar-hover hover:text-white transition-colors w-full"
        >
          <LogOut className="w-5 h-5 flex-shrink-0" />
          Uitloggen
        </button>
      </div>

      {/* Profile indicator */}
      <div className="p-4 border-t border-white/10">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-primary/40 to-primary/20 flex items-center justify-center text-sm font-semibold flex-shrink-0">
            {profile?.full_name?.charAt(0)?.toUpperCase() || 'A'}
          </div>
          <div className="overflow-hidden">
            <p className="text-sm font-medium truncate">{profile?.full_name || 'Admin'}</p>
            <p className="text-xs text-gray-400 truncate">{profile?.email}</p>
          </div>
        </div>
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
