import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import type { Client } from '../../types'
import { Plus, Users, Trash2, UserPlus, Mail, Phone, Building2, X, Globe, FolderKanban } from 'lucide-react'

interface NewUser {
  id: string
  email: string
  full_name: string
  created_at: string
}

interface DomainOption {
  id: string
  name: string
  url: string | null
}

export default function Clients() {
  const [clients, setClients] = useState<Client[]>([])
  const [newUsers, setNewUsers] = useState<NewUser[]>([])
  const [domains, setDomains] = useState<DomainOption[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [linkingUser, setLinkingUser] = useState<NewUser | null>(null)
  const [domainMode, setDomainMode] = useState<'existing' | 'new'>('existing')
  const [formData, setFormData] = useState({ name: '', email: '', phone: '', company: '' })
  const [selectedDomainId, setSelectedDomainId] = useState('')
  const [newDomain, setNewDomain] = useState({ name: '', url: '' })

  const fetchData = async () => {
    const [{ data: clientData }, { data: profileData }, { data: domainData }] = await Promise.all([
      supabase.from('clients').select('*').order('created_at', { ascending: false }),
      supabase.from('profiles').select('id, email, full_name, created_at').eq('role', 'client'),
      supabase.from('projects').select('id, name, url').order('name'),
    ])

    const linkedProfileIds = (clientData || []).map(c => c.profile_id).filter(Boolean)
    const unlinkedProfiles = (profileData || []).filter(p => !linkedProfileIds.includes(p.id))

    setClients(clientData || [])
    setNewUsers(unlinkedProfiles)
    setDomains(domainData || [])
    setLoading(false)
  }

  useEffect(() => { fetchData() }, [])

  const resetForm = () => {
    setShowForm(false)
    setLinkingUser(null)
    setDomainMode('existing')
    setFormData({ name: '', email: '', phone: '', company: '' })
    setSelectedDomainId('')
    setNewDomain({ name: '', url: '' })
  }

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()

    // 1. Create client record
    const { data: clientRecord, error: clientError } = await supabase.from('clients').insert({
      name: formData.name,
      email: formData.email,
      phone: formData.phone || null,
      company: formData.company || null,
      profile_id: linkingUser?.id || null,
    }).select().single()

    if (clientError || !clientRecord) return

    // 2. Link or create domain
    if (domainMode === 'existing' && selectedDomainId) {
      // Link existing domain to this client
      await supabase.from('projects').update({ client_id: clientRecord.id }).eq('id', selectedDomainId)
    } else if (domainMode === 'new' && newDomain.name) {
      // Create new domain and link to this client
      await supabase.from('projects').insert({
        name: newDomain.name,
        url: newDomain.url || null,
        client_id: clientRecord.id,
        current_phase: 'intake',
        status: 'active',
      })
    }

    resetForm()
    fetchData()
  }

  const handleLinkUser = (user: NewUser) => {
    setLinkingUser(user)
    setFormData({
      name: user.full_name,
      email: user.email,
      phone: '',
      company: '',
    })
    setDomainMode('existing')
    setSelectedDomainId('')
    setNewDomain({ name: '', url: '' })
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
          onClick={() => { resetForm(); setShowForm(true) }}
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
            <button onClick={resetForm} className="text-gray-400 hover:text-gray-600">
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
            {/* Client info */}
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

            {/* Domain section */}
            <div className="border-t border-gray-100 pt-4">
              <label className="block text-sm font-medium text-gray-700 mb-3">
                <FolderKanban className="w-4 h-4 inline-block mr-1.5 -mt-0.5" />
                Domein koppelen
              </label>

              {/* Toggle between existing and new */}
              <div className="flex gap-2 mb-3">
                <button
                  type="button"
                  onClick={() => setDomainMode('existing')}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                    domainMode === 'existing'
                      ? 'bg-primary/10 text-primary'
                      : 'text-gray-500 hover:bg-gray-100'
                  }`}
                >
                  Bestaand domein
                </button>
                <button
                  type="button"
                  onClick={() => setDomainMode('new')}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                    domainMode === 'new'
                      ? 'bg-primary/10 text-primary'
                      : 'text-gray-500 hover:bg-gray-100'
                  }`}
                >
                  <Plus className="w-3.5 h-3.5 inline-block mr-1 -mt-0.5" />
                  Nieuw domein
                </button>
              </div>

              {domainMode === 'existing' ? (
                <div>
                  {domains.length > 0 ? (
                    <div className="space-y-2 max-h-48 overflow-y-auto">
                      {domains.map((domain) => (
                        <label
                          key={domain.id}
                          className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                            selectedDomainId === domain.id
                              ? 'border-primary bg-primary/5'
                              : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                          }`}
                        >
                          <input
                            type="radio"
                            name="domain"
                            value={domain.id}
                            checked={selectedDomainId === domain.id}
                            onChange={(e) => setSelectedDomainId(e.target.value)}
                            className="accent-primary"
                          />
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-gray-900">{domain.name}</p>
                            {domain.url && (
                              <p className="text-xs text-gray-400 truncate">{domain.url.replace(/^https?:\/\//, '')}</p>
                            )}
                          </div>
                        </label>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-gray-400 italic">Geen domeinen beschikbaar. Maak een nieuw domein aan.</p>
                  )}
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Domeinnaam *</label>
                    <input
                      type="text"
                      value={newDomain.name}
                      onChange={(e) => setNewDomain({ ...newDomain, name: e.target.value })}
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50"
                      placeholder="bijv. Bakkerij De Gouden Aar"
                      required={domainMode === 'new'}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Website URL</label>
                    <div className="relative">
                      <Globe className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                      <input
                        type="url"
                        value={newDomain.url}
                        onChange={(e) => setNewDomain({ ...newDomain, url: e.target.value })}
                        className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50"
                        placeholder="https://voorbeeld.nl"
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="flex gap-3 pt-2">
              <button type="submit" className="bg-primary hover:bg-primary-600 text-white px-5 py-2.5 rounded-lg font-medium transition-colors text-sm">
                {linkingUser ? 'Koppelen & aanmaken' : 'Aanmaken'}
              </button>
              <button type="button" onClick={resetForm} className="px-4 py-2.5 rounded-lg text-gray-600 hover:bg-gray-100 transition-colors text-sm">
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
