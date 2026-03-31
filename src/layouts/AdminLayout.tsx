import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import {
  LayoutDashboard,
  FolderKanban,
  Users,
  FileText,
  FileCheck,
  Settings,
  LogOut,
} from 'lucide-react'

const navItems = [
  { to: '/admin', icon: LayoutDashboard, label: 'Dashboard', end: true },
  { to: '/admin/projecten', icon: FolderKanban, label: 'Projecten' },
  { to: '/admin/klanten', icon: Users, label: 'Klanten' },
  { to: '/admin/facturen', icon: FileText, label: 'Facturen' },
  { to: '/admin/offertes', icon: FileCheck, label: 'Offertes' },
]

export default function AdminLayout() {
  const { signOut, profile } = useAuth()
  const navigate = useNavigate()

  const handleSignOut = async () => {
    await signOut()
    navigate('/login')
  }

  return (
    <div className="min-h-screen flex bg-gray-50">
      {/* Sidebar */}
      <aside className="w-64 bg-sidebar text-white flex flex-col fixed h-full">
        {/* Logo / Brand */}
        <div className="p-6 border-b border-white/10">
          <h1 className="text-lg font-bold tracking-tight">
            <span className="text-primary-300">Design</span>Pixels
          </h1>
          <p className="text-xs text-gray-400 mt-0.5">Admin Portal</p>
        </div>

        {/* Navigation */}
        <nav className="flex-1 py-4 px-3 space-y-1">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-sidebar-active text-white'
                    : 'text-gray-300 hover:bg-sidebar-hover hover:text-white'
                }`
              }
            >
              <item.icon className="w-5 h-5" />
              {item.label}
            </NavLink>
          ))}
        </nav>

        {/* Bottom section */}
        <div className="p-3 border-t border-white/10 space-y-1">
          <NavLink
            to="/admin/instellingen"
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-sidebar-active text-white'
                  : 'text-gray-300 hover:bg-sidebar-hover hover:text-white'
              }`
            }
          >
            <Settings className="w-5 h-5" />
            Instellingen
          </NavLink>

          <button
            onClick={handleSignOut}
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-gray-300 hover:bg-sidebar-hover hover:text-white transition-colors w-full"
          >
            <LogOut className="w-5 h-5" />
            Uitloggen
          </button>
        </div>

        {/* Profile indicator */}
        <div className="p-4 border-t border-white/10">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-primary/30 flex items-center justify-center text-sm font-medium">
              {profile?.full_name?.charAt(0) || 'A'}
            </div>
            <div className="overflow-hidden">
              <p className="text-sm font-medium truncate">{profile?.full_name || 'Admin'}</p>
              <p className="text-xs text-gray-400 truncate">{profile?.email}</p>
            </div>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 ml-64">
        <div className="p-8">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
