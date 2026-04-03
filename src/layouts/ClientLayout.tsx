import { Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useState, useRef, useEffect, useCallback } from 'react'
import { User, Settings, LogOut, ChevronDown, FolderOpen, Bell, FileCheck, FileText, ClipboardCheck, Layers, X, Sparkles } from 'lucide-react'
import { supabase } from '../lib/supabase'
import type { ClientNotification } from '../types'

const notificationIcons: Record<string, typeof FileCheck> = {
  quote: FileCheck,
  invoice: FileText,
  assignment: ClipboardCheck,
  card_update: Layers,
  general: Sparkles,
}

const notificationColors: Record<string, string> = {
  quote: 'bg-purple-50 border-purple-200 text-purple-800',
  invoice: 'bg-blue-50 border-blue-200 text-blue-800',
  assignment: 'bg-emerald-50 border-emerald-200 text-emerald-800',
  card_update: 'bg-amber-50 border-amber-200 text-amber-800',
  general: 'bg-primary/5 border-primary/20 text-primary',
}

const notificationIconColors: Record<string, string> = {
  quote: 'text-purple-500',
  invoice: 'text-blue-500',
  assignment: 'text-emerald-500',
  card_update: 'text-amber-500',
  general: 'text-primary',
}

export default function ClientLayout() {
  const { signOut, profile } = useAuth()
  const navigate = useNavigate()
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const [notifications, setNotifications] = useState<ClientNotification[]>([])

  const handleSignOut = async () => {
    await signOut()
    navigate('/login')
  }

  const fetchNotifications = useCallback(async () => {
    if (!profile) return

    const { data: client } = await supabase
      .from('clients')
      .select('id')
      .eq('profile_id', profile.id)
      .single()

    if (!client) return

    const { data } = await supabase
      .from('client_notifications')
      .select('*')
      .eq('client_id', client.id)
      .eq('read', false)
      .order('created_at', { ascending: false })
      .limit(10)

    setNotifications(data || [])
  }, [profile])

  const dismissNotification = async (id: string) => {
    await supabase.from('client_notifications').update({ read: true }).eq('id', id)
    setNotifications(prev => prev.filter(n => n.id !== id))
  }

  const dismissAll = async () => {
    const ids = notifications.map(n => n.id)
    if (ids.length === 0) return
    await supabase.from('client_notifications').update({ read: true }).in('id', ids)
    setNotifications([])
  }

  useEffect(() => {
    fetchNotifications()
  }, [fetchNotifications])

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="bg-white border-b border-gray-100 sticky top-0 z-50 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-14 sm:h-16">
            {/* Logo */}
            <div className="flex items-center">
              <h1
                className="text-lg font-bold tracking-tight cursor-pointer"
                onClick={() => navigate('/')}
              >
                <span className="text-primary">Design</span>
                <span className="text-gray-900">Pixels</span>
              </h1>
            </div>

            {/* Profile dropdown */}
            <div className="relative" ref={menuRef}>
              <button
                onClick={() => setMenuOpen(!menuOpen)}
                className="flex items-center gap-2 py-1.5 px-2 sm:px-3 rounded-xl hover:bg-gray-50 border border-transparent hover:border-gray-200 transition-all"
              >
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center border border-primary/10">
                  <User className="w-4 h-4 text-primary" />
                </div>
                <span className="text-sm font-medium text-gray-700 hidden sm:block max-w-[120px] truncate">
                  {profile?.full_name || 'Gebruiker'}
                </span>
                <ChevronDown className={`w-3.5 h-3.5 text-gray-400 hidden sm:block transition-transform ${menuOpen ? 'rotate-180' : ''}`} />
              </button>

              {menuOpen && (
                <div className="absolute right-0 mt-2 w-52 bg-white rounded-xl shadow-xl shadow-gray-200/50 border border-gray-100 py-1.5 z-50 overflow-hidden">
                  {/* User info */}
                  <div className="px-4 py-2.5 border-b border-gray-100">
                    <p className="text-sm font-semibold text-gray-900 truncate">{profile?.full_name || 'Gebruiker'}</p>
                    <p className="text-xs text-gray-400 truncate">{profile?.email}</p>
                  </div>

                  <div className="py-1">
                    <button
                      onClick={() => {
                        setMenuOpen(false)
                        navigate('/bestanden')
                      }}
                      className="flex items-center gap-3 w-full px-4 py-2.5 text-sm text-gray-600 hover:bg-gray-50 hover:text-gray-900 transition-colors"
                    >
                      <FolderOpen className="w-4 h-4" />
                      Mijn bestanden
                    </button>
                    <button
                      onClick={() => {
                        setMenuOpen(false)
                        navigate('/instellingen')
                      }}
                      className="flex items-center gap-3 w-full px-4 py-2.5 text-sm text-gray-600 hover:bg-gray-50 hover:text-gray-900 transition-colors"
                    >
                      <Settings className="w-4 h-4" />
                      Instellingen
                    </button>
                  </div>

                  <div className="border-t border-gray-100 py-1">
                    <button
                      onClick={handleSignOut}
                      className="flex items-center gap-3 w-full px-4 py-2.5 text-sm text-red-500 hover:bg-red-50 transition-colors"
                    >
                      <LogOut className="w-4 h-4" />
                      Uitloggen
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Notification banners */}
      {notifications.length > 0 && (
        <div className="bg-white border-b border-gray-100">
          <div className="max-w-3xl mx-auto px-4 sm:px-6 py-3 space-y-2">
            {notifications.length > 1 && (
              <div className="flex justify-end">
                <button
                  onClick={dismissAll}
                  className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
                >
                  Alles markeren als gelezen
                </button>
              </div>
            )}
            {notifications.map((notification) => {
              const Icon = notificationIcons[notification.type] || Bell
              const colorClass = notificationColors[notification.type] || notificationColors.general
              const iconColor = notificationIconColors[notification.type] || notificationIconColors.general

              return (
                <div
                  key={notification.id}
                  className={`flex items-start gap-3 px-4 py-3 rounded-xl border ${colorClass} animate-in fade-in slide-in-from-top-2`}
                >
                  <div className="flex-shrink-0 mt-0.5">
                    <Icon className={`w-4 h-4 ${iconColor}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold">{notification.title}</p>
                    {notification.message && (
                      <p className="text-xs opacity-75 mt-0.5">{notification.message}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {notification.link_url && (
                      <button
                        onClick={() => {
                          dismissNotification(notification.id)
                          navigate(notification.link_url!)
                        }}
                        className="text-xs font-medium underline underline-offset-2 opacity-75 hover:opacity-100 transition-opacity"
                      >
                        Bekijken
                      </button>
                    )}
                    <button
                      onClick={() => dismissNotification(notification.id)}
                      className="p-0.5 opacity-50 hover:opacity-100 transition-opacity"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Main content — full width, Portal handles its own layout */}
      <main>
        <Outlet />
      </main>
    </div>
  )
}
