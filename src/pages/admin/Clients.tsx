import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import type { Client } from '../../types'
import { Plus, Users, Trash2 } from 'lucide-react'

export default function Clients() {
  const [clients, setClients] = useState<Client[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [formData, setFormData] = useState({ name: '', email: '', phone: '', company: '' })

  const fetchClients = async () => {
    const { data } = await supabase.from('clients').select('*').order('created_at', { ascending: false })
    setClients(data || [])
    setLoading(false)
  }

  useEffect(() => { fetchClients() }, [])

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    const { error } = await supabase.from('clients').insert({
      name: formData.name,
      email: formData.email,
      phone: formData.phone || null,
      company: formData.company || null,
    })
    if (!error) {
      setShowForm(false)
      setFormData({ name: '', email: '', phone: '', company: '' })
      fetchClients()
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Weet je zeker dat je deze klant wilt verwijderen?')) return
    await supabase.from('clients').delete().eq('id', id)
    fetchClients()
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Klanten</h1>
          <p className="text-gray-500 mt-1">Beheer je klanten</p>
        </div>
        <button onClick={() => setShowForm(!showForm)} className="flex items-center gap-2 bg-primary hover:bg-primary-600 text-white px-4 py-2.5 rounded-lg font-medium transition-colors">
          <Plus className="w-4 h-4" />
          Nieuwe klant
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="bg-white rounded-xl p-6 shadow-sm border border-gray-100 mb-6 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Naam</label>
              <input type="text" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50" required />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">E-mail</label>
              <input type="email" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50" required />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Telefoon</label>
              <input type="text" value={formData.phone} onChange={(e) => setFormData({ ...formData, phone: e.target.value })} className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Bedrijf</label>
              <input type="text" value={formData.company} onChange={(e) => setFormData({ ...formData, company: e.target.value })} className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50" />
            </div>
          </div>
          <div className="flex gap-3">
            <button type="submit" className="bg-primary hover:bg-primary-600 text-white px-4 py-2 rounded-lg font-medium transition-colors">Aanmaken</button>
            <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 rounded-lg text-gray-600 hover:bg-gray-100 transition-colors">Annuleren</button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="space-y-4">{[...Array(3)].map((_, i) => (<div key={i} className="bg-white rounded-xl p-6 shadow-sm animate-pulse"><div className="h-16" /></div>))}</div>
      ) : clients.length === 0 ? (
        <div className="bg-white rounded-xl p-12 shadow-sm border border-gray-100 text-center">
          <Users className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900">Nog geen klanten</h3>
          <p className="text-gray-500 mt-1">Voeg je eerste klant toe om te beginnen.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {clients.map((client) => (
            <div key={client.id} className="bg-white rounded-xl p-6 shadow-sm border border-gray-100 flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-gray-900">{client.name}</h3>
                <p className="text-sm text-gray-500">{client.email}</p>
                <div className="flex gap-4 mt-1">
                  {client.company && <span className="text-xs text-gray-400">{client.company}</span>}
                  {client.phone && <span className="text-xs text-gray-400">{client.phone}</span>}
                </div>
              </div>
              <button onClick={() => handleDelete(client.id)} className="p-2 text-gray-400 hover:text-red-500 transition-colors">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
