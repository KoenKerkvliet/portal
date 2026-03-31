import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import type { Project, ProjectPhase } from '../../types'
import { Plus, FolderKanban, Trash2 } from 'lucide-react'

const phaseLabels: Record<ProjectPhase, string> = {
  intake: 'Intake',
  design: 'Design',
  development: 'Development',
  review: 'Review',
  opgeleverd: 'Opgeleverd',
}

const phaseColors: Record<ProjectPhase, string> = {
  intake: 'bg-blue-100 text-blue-700',
  design: 'bg-purple-100 text-purple-700',
  development: 'bg-yellow-100 text-yellow-700',
  review: 'bg-orange-100 text-orange-700',
  opgeleverd: 'bg-green-100 text-green-700',
}

export default function Projects() {
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [formData, setFormData] = useState({ name: '', description: '', client_id: '', current_phase: 'intake' as ProjectPhase })
  const [clients, setClients] = useState<{ id: string; name: string }[]>([])

  const fetchProjects = async () => {
    const { data } = await supabase
      .from('projects')
      .select('*, client:clients(id, name)')
      .order('created_at', { ascending: false })
    setProjects(data || [])
    setLoading(false)
  }

  const fetchClients = async () => {
    const { data } = await supabase.from('clients').select('id, name')
    setClients(data || [])
  }

  useEffect(() => {
    fetchProjects()
    fetchClients()
  }, [])

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    const { error } = await supabase.from('projects').insert({
      name: formData.name,
      description: formData.description || null,
      client_id: formData.client_id,
      current_phase: formData.current_phase,
      status: 'active',
    })
    if (!error) {
      setShowForm(false)
      setFormData({ name: '', description: '', client_id: '', current_phase: 'intake' })
      fetchProjects()
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Weet je zeker dat je dit project wilt verwijderen?')) return
    await supabase.from('projects').delete().eq('id', id)
    fetchProjects()
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Projecten</h1>
          <p className="text-gray-500 mt-1">Beheer je projecten</p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-2 bg-primary hover:bg-primary-600 text-white px-4 py-2.5 rounded-lg font-medium transition-colors"
        >
          <Plus className="w-4 h-4" />
          Nieuw project
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="bg-white rounded-xl p-6 shadow-sm border border-gray-100 mb-6 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Naam</label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Klant</label>
              <select
                value={formData.client_id}
                onChange={(e) => setFormData({ ...formData, client_id: e.target.value })}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50"
                required
              >
                <option value="">Selecteer een klant</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Beschrijving</label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50"
              rows={3}
            />
          </div>
          <div className="flex gap-3">
            <button type="submit" className="bg-primary hover:bg-primary-600 text-white px-4 py-2 rounded-lg font-medium transition-colors">
              Aanmaken
            </button>
            <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 rounded-lg text-gray-600 hover:bg-gray-100 transition-colors">
              Annuleren
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="space-y-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="bg-white rounded-xl p-6 shadow-sm animate-pulse"><div className="h-16" /></div>
          ))}
        </div>
      ) : projects.length === 0 ? (
        <div className="bg-white rounded-xl p-12 shadow-sm border border-gray-100 text-center">
          <FolderKanban className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900">Nog geen projecten</h3>
          <p className="text-gray-500 mt-1">Maak je eerste project aan om te beginnen.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {projects.map((project) => (
            <div key={project.id} className="bg-white rounded-xl p-6 shadow-sm border border-gray-100 flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-gray-900">{project.name}</h3>
                <p className="text-sm text-gray-500 mt-0.5">{(project.client as unknown as { name: string })?.name || 'Geen klant'}</p>
                {project.description && <p className="text-sm text-gray-400 mt-1">{project.description}</p>}
              </div>
              <div className="flex items-center gap-3">
                <span className={`px-3 py-1 rounded-full text-xs font-medium ${phaseColors[project.current_phase]}`}>
                  {phaseLabels[project.current_phase]}
                </span>
                <button onClick={() => handleDelete(project.id)} className="p-2 text-gray-400 hover:text-red-500 transition-colors">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
