import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import type { Client, Profile } from '../../types'
import { Plus, Users, Trash2, UserPlus, Mail, Phone, Building2, Globe, ChevronDown, ChevronUp, X } from 'lucide-react'

interface NewUser {
  id: string
  email: string
  full_name: string
  created_at: string
}

export default function Clients() {
  const [clients, setClients] = useState<Client[]>([])
  const [newUsers, setNewUsers] = useState<NewUser[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [linkingUser, setLinkingUser] = useState<NewUser | null>(null)
  const [formData, setFormData] = useState({ name: '', email: '', phone: '', company: '', domain: '' })

  const fetchData = async () => {
    // Fetch clients with their profile info
    const { data: clientData } = await supabase
      .from('clients')
      .select('*')
      .order('created_at', { ascending: false })

    // Fetch profiles that are clients but not yet linked to a client record
    const { data: profileData } = await supabase
      .from('profiles')
      .select('id, email, full_name, created_at')
      .eq('role', 'client')

    const linkedProfileIds = (clientData || [])
      .map(c => c.profile_id)
      .filter(Boolean)

    const unlinkedProfiles = (profileData || []).filter(
      p => !linkedProfileIds.includes(p.id)
    )

    setClients(clientData || [])
    setNewUsers(unlinkedProfiles)
    setLoading(false)
  }

  useEffect(() => { fetchData() }, [])

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    const { error } = await supabase.from('clients').insert({
      name: formData.name,
      email: formData.email,
      phone: formData.phone || null,
      company: formData.company || null,
      profile_id: linkingUser?.id || null,
    })
    if (!error) {
      setShowForm(false)
      setLinkingUser(null)
      setFormData({ name: '', email: '', phone: '', company: '', domain: '' })
      fetchData()
    }
  }

  const handleLinkUser = (user: NewUser) => {
    setLinkingUser(user)
    setFormData({
      name: user.full_name,
      email: user.email,
      phone: '',
      company: '',
      domain: '',
    })
    setShowForm(true)
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Weet je zeker dat je deze klant wilt verwijderen?')) return
    await supabase.from('clients').delete().eq('id', id)
    fetchData()
  }

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('nl-NL', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    })
  }

  const timeSince = (dateStr: string) => {
    const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000)
    const minutes = Math.floor(seconds / 60)
    const hours = Math.floor(minutes / 60)
    const days = Math.floor(hours / 24)
    if (days > 0) return `${days} dag${days > 1 ? 'en' : ''} geleden`
    if (hours > 0) return `${hours} uur geleden`
    if (minutes > 0) return `${minutes} min geleden`
    return 'Zojuist'
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6 sm:mb-8">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Klanten</h1>
          <p className="text-gray-500 mt-1">Beheer je klanten</p>
        </div>
        <button
          onClick={() => { setLinkingUser(null); setFormData({ name: '', email: '', phone: '', company: '', domain: '' }); setShowForm(!showForm) }}
          className="flex items-center gap-2 bg-primary hover:bg-primary-600 text-white px-4 py-2.5 rounded-lg font-medium transition-colors text-sm"
        >
          <Plus className="w-4 h-4" />
          <span className="hidden sm:inline">Nieuwe klant</span>
        </button>
      </div>

      {/* New Users Section */}
      {!loading && newUsers.length > 0 && (
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
            <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
              Nieuwe aanmeldingen ({newUsers.length})
            </h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {newUsers.map((user) => (
              <div
                key={user.id}
                className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-center justify-between gap-3"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-amber-200 text-amber-700 flex items-center justify-center text-sm font-bold flex-shrink-0">
                      {user.full_name?.charAt(0)?.toUpperCase() || '?'}
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold text-gray-900 text-sm truncate">{user.full_name || 'Onbekend'}</p>
                      <p className="text-xs text-gray-500 truncate">{user.email}</p>
                    </div>
                  </div>
                  <p className="text-xs text-amber-600 mt-2">{timeSince(user.created_at)}</p>
                </div>
                <button
                  onClick={() => handleLinkUser(user)}
                  className="flex-shrink-0 flex items-center gap-1.5 bg-primary hover:bg-primary-600 text-white px-3 py-2 rounded-lg text-xs font-medium transition-colors"
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  Koppelen
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Create/Link Form */}
      {showForm && (
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-gray-900">
              {linkingUser ? `Koppel ${linkingUser.full_name} als klant` : 'Nieuwe klant aanmaken'}
            </h3>
            <button onClick={() => { setShowForm(false); setLinkingUser(null) }} className="text-gray-400 hover:text-gray-600">
              <X className="w-5 h-5" />
            </button>
          </div>
          {linkingUser && (
            <div className="bg-primary/5 border border-primary/10 rounded-lg px-4 py-3 mb-4 flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-sm font-bold">
                {linkingUser.full_name?.charAt(0)?.toUpperCase() || '?'}
              </div>
              <div>
                <p className="text-sm font-medium text-gray-900">Gekoppeld account: {linkingUser.email}</p>
                <p className="text-xs text-gray-500">Deze klant krijgt toegang tot het portaal</p>
              </div>
            </div>
          )}
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Naam *</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">E-mail *</label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Telefoon</label>
                <input
                  type="text"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50"
                  placeholder="06-12345678"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Bedrijf</label>
                <input
                  type="text"
                  value={formData.company}
                  onChange={(e) => setFormData({ ...formData, company: e.target.value })}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>
            </div>
            <div className="flex gap-3 pt-2">
              <button type="submit" className="bg-primary hover:bg-primary-600 text-white px-5 py-2.5 rounded-lg font-medium transition-colors text-sm">
                {linkingUser ? 'Koppelen & aanmaken' : 'Aanmaken'}
              </button>
              <button type="button" onClick={() => { setShowForm(false); setLinkingUser(null) }} className="px-4 py-2.5 rounded-lg text-gray-600 hover:bg-gray-100 transition-colors text-sm">
                Annuleren
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Client Cards */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="bg-white rounded-xl p-6 shadow-sm animate-pulse border border-gray-100">
              <div className="h-24" />
            </div>
          ))}
        </div>
      ) : clients.length === 0 && newUsers.length === 0 ? (
        <div className="bg-white rounded-xl p-12 shadow-sm border border-gray-100 text-center">
          <Users className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900">Nog geen klanten</h3>
          <p className="text-gray-500 mt-1">Voeg je eerste klant toe of wacht op nieuwe aanmeldingen.</p>
        </div>
      ) : clients.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">
            Klanten ({clients.length})
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {clients.map((client) => (
              <div key={client.id} className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                {/* Card Header */}
                <div className="p-5">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center text-sm font-bold flex-shrink-0">
                        {client.name?.charAt(0)?.toUpperCase() || '?'}
                      </div>
                      <div className="min-w-0">
                        <h3 className="font-semibold text-gray-900 truncate">{client.name}</h3>
                        {client.company && (
                          <p className="text-xs text-gray-400 truncate">{client.company}</p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      {client.profile_id && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
                          Portaal
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Contact Info */}
                  <div className="mt-4 space-y-2">
                    <div className="flex items-center gap-2 text-sm text-gray-600">
                      <Mail className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                      <span className="truncate">{client.email}</span>
                    </div>
                    {client.phone && (
                      <div className="flex items-center gap-2 text-sm text-gray-600">
                        <Phone className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                        <span>{client.phone}</span>
                      </div>
                    )}
                    {client.company && (
                      <div className="flex items-center gap-2 text-sm text-gray-600">
                        <Building2 className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                        <span>{client.company}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Card Footer */}
                <div className="px-5 py-3 bg-gray-50 border-t border-gray-100 flex items-center justify-between">
                  <span className="text-xs text-gray-400">Klant sinds {formatDate(client.created_at)}</span>
                  <button
                    onClick={() => handleDelete(client.id)}
                    className="p-1.5 text-gray-400 hover:text-red-500 transition-colors rounded-md hover:bg-red-50"
                    title="Verwijderen"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
