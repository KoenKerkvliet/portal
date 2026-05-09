import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { applyDefaultTemplates } from '../../lib/applyDefaultTemplates'
import type { Client } from '../../types'
import { Plus, Users, Trash2, UserPlus, Mail, Phone, Building2, X, Globe, FolderKanban, Pencil, Archive, ArchiveRestore, KeyRound } from 'lucide-react'

const MAX_EXTRA_EMAILS = 2

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

interface ClientDomain {
  id: string
  name: string
}

export default function Clients() {
  const [clients, setClients] = useState<Client[]>([])
  const [newUsers, setNewUsers] = useState<NewUser[]>([])
  const [domains, setDomains] = useState<DomainOption[]>([])
  const [clientDomains, setClientDomains] = useState<Record<string, ClientDomain[]>>({})
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [viewMode, setViewMode] = useState<'active' | 'archived'>('active')
  const [linkingUser, setLinkingUser] = useState<NewUser | null>(null)
  const [invitingId, setInvitingId] = useState<string | null>(null)
  const [domainMode, setDomainMode] = useState<'existing' | 'new'>('existing')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [formData, setFormData] = useState({ name: '', email: '', phone: '', company: '' })
  const [extraEmails, setExtraEmails] = useState<string[]>([])
  const [selectedDomainId, setSelectedDomainId] = useState('')
  const [newDomain, setNewDomain] = useState({ name: '', url: '' })

  const fetchData = async () => {
    const [{ data: clientData }, { data: profileData }, { data: domainData }, { data: pcData }] = await Promise.all([
      supabase.from('clients').select('*').order('created_at', { ascending: false }),
      supabase.from('profiles').select('id, email, full_name, created_at').eq('role', 'client'),
      supabase.from('projects').select('id, name, url').order('name'),
      supabase.from('project_clients').select('client_id, project:projects(id, name)'),
    ])

    const linkedProfileIds = (clientData || []).map(c => c.profile_id).filter(Boolean)
    const unlinkedProfiles = (profileData || []).filter(p => !linkedProfileIds.includes(p.id))

    // Domeinen per klant verzamelen op basis van project_clients.
    // Supabase typeert de joined `project` als array; runtime is het een single object
    // (many-to-one via FK). We casten via unknown om de strikte type-check te omzeilen.
    type PCRow = { client_id: string; project: { id: string; name: string } | null }
    const domainsByClient: Record<string, ClientDomain[]> = {}
    for (const row of ((pcData || []) as unknown as PCRow[])) {
      if (!row.project) continue
      if (!domainsByClient[row.client_id]) domainsByClient[row.client_id] = []
      domainsByClient[row.client_id].push({ id: row.project.id, name: row.project.name })
    }

    setClients(clientData || [])
    setNewUsers(unlinkedProfiles)
    setDomains(domainData || [])
    setClientDomains(domainsByClient)
    setLoading(false)
  }

  useEffect(() => { fetchData() }, [])

  const resetForm = () => {
    setShowForm(false)
    setEditingId(null)
    setLinkingUser(null)
    setDomainMode('existing')
    setFormData({ name: '', email: '', phone: '', company: '' })
    setExtraEmails([])
    setSelectedDomainId('')
    setNewDomain({ name: '', url: '' })
  }

  const handleEdit = (client: Client) => {
    setEditingId(client.id)
    setFormData({
      name: client.name,
      email: client.email,
      phone: client.phone || '',
      company: client.company || '',
    })
    setExtraEmails(client.email_extra || [])
    setShowForm(true)
  }

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()

    const cleanedExtraEmails = extraEmails.map((e) => e.trim()).filter(Boolean)

    if (editingId) {
      // Update existing client
      const { error: updateError } = await supabase.from('clients').update({
        name: formData.name.trim(),
        email: formData.email.trim(),
        email_extra: cleanedExtraEmails,
        phone: formData.phone || null,
        company: formData.company || null,
      }).eq('id', editingId)
      if (updateError) {
        alert('Klant bijwerken mislukt: ' + updateError.message)
        return
      }
      resetForm()
      fetchData()
      return
    }

    // 1. Create client record
    const { data: clientRecord, error: clientError } = await supabase.from('clients').insert({
      name: formData.name.trim(),
      email: formData.email.trim(),
      email_extra: cleanedExtraEmails,
      phone: formData.phone || null,
      company: formData.company || null,
      profile_id: linkingUser?.id || null,
    }).select().single()

    if (clientError || !clientRecord) {
      if (clientError) alert('Klant aanmaken mislukt: ' + clientError.message)
      return
    }

    // 2. Link or create domain
    if (domainMode === 'existing' && selectedDomainId) {
      // Voeg de klant toe aan project_clients (de "echte" bron voor de domeinkaart).
      // Alleen als 'ie er nog niet in zit. De primary projects.client_id alleen
      // overschrijven als er nog geen andere klant gekoppeld was.
      const { data: existingPCs } = await supabase
        .from('project_clients')
        .select('client_id')
        .eq('project_id', selectedDomainId)
      const alreadyLinked = (existingPCs || []).some((pc) => pc.client_id === clientRecord.id)
      const isFirst = !existingPCs || existingPCs.length === 0
      if (!alreadyLinked) {
        await supabase.from('project_clients').insert({
          project_id: selectedDomainId,
          client_id: clientRecord.id,
          notify_invoices: isFirst,
          notify_quotes: isFirst,
          notify_portal: isFirst,
        })
      }
      if (isFirst) {
        await supabase.from('projects').update({ client_id: clientRecord.id }).eq('id', selectedDomainId)
      }
    } else if (domainMode === 'new' && newDomain.name) {
      const { data: newProject } = await supabase.from('projects').insert({
        name: newDomain.name,
        url: newDomain.url || null,
        client_id: clientRecord.id,
        current_phase: 'intake',
        status: 'active',
      }).select('id').single()
      // Ook in project_clients zetten zodat de domeinkaart 'm meteen toont
      // (in plaats van te wachten op de lazy-migration in Projects.tsx).
      if (newProject) {
        await supabase.from('project_clients').insert({
          project_id: newProject.id,
          client_id: clientRecord.id,
          notify_invoices: true,
          notify_quotes: true,
          notify_portal: true,
        })
        // Faseen met exact één template meteen koppelen — voorkomt dat de admin
        // eerst handmatig per fase een template moet kiezen voor een ze offertes
        // etc. kan toewijzen.
        await applyDefaultTemplates(newProject.id)
      }
    }

    resetForm()
    fetchData()
  }

  const handleUnlinkDomain = async (clientId: string, projectId: string, projectName: string) => {
    const ok = confirm(
      `Klant ontkoppelen van domein "${projectName}"?\n\n` +
      `Het domein zelf blijft bestaan. Alleen de koppeling tussen deze klant en het domein wordt verwijderd.`
    )
    if (!ok) return

    // 1. Verwijder de project_clients-rij
    const { error: pcErr } = await supabase
      .from('project_clients')
      .delete()
      .eq('project_id', projectId)
      .eq('client_id', clientId)
    if (pcErr) {
      alert('Ontkoppelen mislukt: ' + pcErr.message)
      return
    }

    // 2. Als deze klant de primary was (projects.client_id), kies een vervanger of zet naar NULL
    const { data: project } = await supabase
      .from('projects')
      .select('client_id')
      .eq('id', projectId)
      .single()

    if (project?.client_id === clientId) {
      const { data: remaining } = await supabase
        .from('project_clients')
        .select('client_id')
        .eq('project_id', projectId)
        .limit(1)
      const newPrimary = remaining?.[0]?.client_id || null
      const { error: updErr } = await supabase
        .from('projects')
        .update({ client_id: newPrimary })
        .eq('id', projectId)
      if (updErr) {
        alert(
          'Klant ontkoppeld, maar de primary-koppeling op het domein kon niet leeg gemaakt worden. ' +
          'Mogelijk moet de SQL-migratie fix-client-cascade.sql nog gedraaid worden.\n\n' +
          updErr.message
        )
      }
    }

    fetchData()
  }

  const handleDeleteNewUser = async (user: NewUser) => {
    const ok = confirm(
      `Account van ${user.full_name || user.email} definitief verwijderen?\n\n` +
      `Dit verwijdert de gebruiker volledig uit de database. ` +
      `Het e-mailadres ${user.email} kan daarna opnieuw gebruikt worden voor registratie.\n\n` +
      `Deze actie kan niet ongedaan gemaakt worden.`
    )
    if (!ok) return

    const { data, error } = await supabase.functions.invoke('delete-user', {
      body: { user_id: user.id },
    })
    if (error || !data?.success) {
      alert('Verwijderen mislukt: ' + (data?.error || error?.message || 'onbekende fout'))
      return
    }
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
    setExtraEmails([])
    setDomainMode('existing')
    setSelectedDomainId('')
    setNewDomain({ name: '', url: '' })
    setShowForm(true)
  }

  const handleInvite = async (client: Client) => {
    if (!client.email) {
      alert('Deze klant heeft geen e-mailadres. Voeg er eerst eentje toe via "Bewerken".')
      return
    }
    const ok = confirm(
      `Stuur ${client.name} een uitnodiging voor het portaal?\n\n` +
      `Er wordt een account aangemaakt op ${client.email} en de klant krijgt een mail met een link om een wachtwoord te kiezen.`
    )
    if (!ok) return

    setInvitingId(client.id)
    const { data, error } = await supabase.functions.invoke('invite-client', {
      body: { client_id: client.id },
    })
    setInvitingId(null)
    if (error || !data?.success) {
      alert('Uitnodiging versturen mislukt: ' + (data?.error || error?.message || 'onbekende fout'))
      return
    }
    fetchData()
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Weet je zeker dat je deze klant definitief wilt verwijderen? Deze actie kan niet ongedaan gemaakt worden.')) return
    await supabase.from('clients').delete().eq('id', id)
    fetchData()
  }

  const handleArchive = async (id: string) => {
    if (!confirm('Klant archiveren? De klant verdwijnt uit het overzicht maar je kunt hem later weer terughalen.')) return
    const { error } = await supabase.from('clients').update({ status: 'archived' }).eq('id', id)
    if (error) {
      alert('Archiveren mislukt: ' + error.message + '\n\nMogelijk is de SQL add-client-status-column.sql nog niet gedraaid in Supabase.')
      return
    }
    fetchData()
  }

  const handleRestore = async (id: string) => {
    const { error } = await supabase.from('clients').update({ status: 'active' }).eq('id', id)
    if (error) {
      alert('Herstellen mislukt: ' + error.message)
      return
    }
    fetchData()
  }

  const visibleClients = clients.filter((c) => {
    const status = c.status || 'active'
    if (viewMode === 'active') return status === 'active'
    return status === 'archived'
  })

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
      <div className="flex items-center justify-between mb-6 sm:mb-8 gap-3 flex-wrap">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Klanten</h1>
          <p className="text-gray-500 mt-1">Beheer je klanten</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="inline-flex bg-gray-100 rounded-lg p-1">
            <button
              type="button"
              onClick={() => setViewMode('active')}
              className={`px-3 py-1.5 text-xs sm:text-sm font-medium rounded-md transition-colors ${viewMode === 'active' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
            >
              Actief
            </button>
            <button
              type="button"
              onClick={() => setViewMode('archived')}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs sm:text-sm font-medium rounded-md transition-colors ${viewMode === 'archived' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
            >
              <Archive className="w-3.5 h-3.5" />
              Gearchiveerd
            </button>
          </div>
          {viewMode === 'active' && (
            <button
              onClick={() => { resetForm(); setShowForm(true) }}
              className="flex items-center gap-2 bg-primary hover:bg-primary-600 text-white px-4 py-2.5 rounded-lg font-medium transition-colors text-sm"
            >
              <Plus className="w-4 h-4" />
              <span className="hidden sm:inline">Nieuwe klant</span>
            </button>
          )}
        </div>
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
                <div className="flex-shrink-0 flex items-center gap-1">
                  <button
                    onClick={() => handleLinkUser(user)}
                    className="flex items-center gap-1.5 bg-primary hover:bg-primary-600 text-white px-3 py-2 rounded-lg text-xs font-medium transition-colors"
                  >
                    <UserPlus className="w-3.5 h-3.5" />
                    Koppelen
                  </button>
                  <button
                    onClick={() => handleDeleteNewUser(user)}
                    className="p-2 text-amber-700 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                    title="Definitief verwijderen"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
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
              {editingId ? 'Klant bewerken' : linkingUser ? `Koppel ${linkingUser.full_name} als klant` : 'Nieuwe klant aanmaken'}
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
                {extraEmails.map((extra, idx) => (
                  <div key={idx} className="flex items-center gap-2 mt-2">
                    <input
                      type="email"
                      value={extra}
                      onChange={(e) => {
                        const next = [...extraEmails]
                        next[idx] = e.target.value
                        setExtraEmails(next)
                      }}
                      className="flex-1 px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50"
                      placeholder={`Extra e-mailadres ${idx + 2}`}
                    />
                    <button
                      type="button"
                      onClick={() => setExtraEmails(extraEmails.filter((_, i) => i !== idx))}
                      className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                      title="Verwijder dit e-mailadres"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ))}
                {extraEmails.length < MAX_EXTRA_EMAILS && (
                  <button
                    type="button"
                    onClick={() => setExtraEmails([...extraEmails, ''])}
                    className="flex items-center gap-1.5 mt-2 text-xs text-primary hover:text-primary-600 transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Extra e-mailadres toevoegen
                  </button>
                )}
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

            {/* Domain section — hide when editing */}
            {!editingId && <div className="border-t border-gray-100 pt-4">
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
            </div>}

            <div className="flex gap-3 pt-2">
              <button type="submit" className="bg-primary hover:bg-primary-600 text-white px-5 py-2.5 rounded-lg font-medium transition-colors text-sm">
                {editingId ? 'Opslaan' : linkingUser ? 'Koppelen & aanmaken' : 'Aanmaken'}
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
      ) : visibleClients.length === 0 && newUsers.length === 0 ? (
        <div className="bg-white rounded-xl p-12 shadow-sm border border-gray-100 text-center">
          <Users className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900">
            {viewMode === 'archived' ? 'Geen gearchiveerde klanten' : 'Nog geen klanten'}
          </h3>
          <p className="text-gray-500 mt-1">
            {viewMode === 'archived' ? 'Klanten die je archiveert verschijnen hier.' : 'Voeg je eerste klant toe of wacht op nieuwe aanmeldingen.'}
          </p>
        </div>
      ) : visibleClients.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">
            {viewMode === 'archived' ? 'Gearchiveerde klanten' : 'Klanten'} ({visibleClients.length})
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {visibleClients.map((client) => (
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
                      {client.profile_id ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
                          Portaal
                        </span>
                      ) : viewMode === 'active' && (
                        <button
                          onClick={() => handleInvite(client)}
                          disabled={invitingId === client.id}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-700 hover:bg-amber-100 transition-colors disabled:opacity-50 disabled:cursor-wait"
                          title="Stuur deze klant een uitnodiging om het portaal te gebruiken"
                        >
                          <KeyRound className="w-3 h-3" />
                          {invitingId === client.id ? 'Bezig...' : 'Geef toegang'}
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Contact Info */}
                  <div className="mt-4 space-y-2">
                    <div className="flex items-center gap-2 text-sm text-gray-600">
                      <Mail className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                      <span className="truncate">{client.email}</span>
                    </div>
                    {(client.email_extra || []).filter(Boolean).map((extra, idx) => (
                      <div key={idx} className="flex items-center gap-2 text-sm text-gray-500 pl-5">
                        <span className="truncate">{extra}</span>
                      </div>
                    ))}
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

                  {/* Gekoppelde domeinen */}
                  {(clientDomains[client.id] || []).length > 0 && (
                    <div className="mt-4 pt-3 border-t border-gray-100">
                      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Domeinen</p>
                      <div className="flex flex-wrap gap-1.5">
                        {(clientDomains[client.id] || []).map((d) => (
                          <span
                            key={d.id}
                            className="inline-flex items-center gap-1.5 bg-primary/5 text-primary text-xs px-2 py-1 rounded-md"
                          >
                            <FolderKanban className="w-3 h-3 flex-shrink-0" />
                            <span className="truncate max-w-[140px]">{d.name}</span>
                            <button
                              onClick={() => handleUnlinkDomain(client.id, d.id, d.name)}
                              className="text-primary/40 hover:text-red-500 transition-colors flex-shrink-0"
                              title="Ontkoppelen (domein blijft bestaan)"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Card Footer */}
                <div className="px-5 py-3 bg-gray-50 border-t border-gray-100 flex items-center justify-between">
                  <span className="text-xs text-gray-400">Klant sinds {formatDate(client.created_at)}</span>
                  <div className="flex items-center gap-1">
                    {viewMode === 'active' ? (
                      <>
                        <button
                          onClick={() => handleEdit(client)}
                          className="p-1.5 text-gray-400 hover:text-primary transition-colors rounded-md hover:bg-primary/5"
                          title="Bewerken"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleArchive(client.id)}
                          className="p-1.5 text-gray-400 hover:text-amber-600 transition-colors rounded-md hover:bg-amber-50"
                          title="Archiveren"
                        >
                          <Archive className="w-3.5 h-3.5" />
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => handleRestore(client.id)}
                        className="flex items-center gap-1 px-2 py-1 text-xs text-green-700 hover:bg-green-50 transition-colors rounded-md"
                        title="Herstellen"
                      >
                        <ArchiveRestore className="w-3.5 h-3.5" />
                        Herstellen
                      </button>
                    )}
                    <button
                      onClick={() => handleDelete(client.id)}
                      className="p-1.5 text-gray-400 hover:text-red-500 transition-colors rounded-md hover:bg-red-50"
                      title={viewMode === 'archived' ? 'Definitief verwijderen' : 'Verwijderen'}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
