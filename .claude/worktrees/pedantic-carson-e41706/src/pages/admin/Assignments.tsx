import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import type { Assignment } from '../../types'
import { Plus, ClipboardCheck, Trash2, Pencil, X, Save, Loader2 } from 'lucide-react'
import RichTextEditor from '../../components/RichTextEditor'

export default function Assignments() {
  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [loading, setLoading] = useState(true)
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([])
  const [clients, setClients] = useState<{ id: string; name: string }[]>([])

  // Form state
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [formTitle, setFormTitle] = useState('')
  const [formProjectId, setFormProjectId] = useState('')
  const [formClientId, setFormClientId] = useState('')
  const [formContent, setFormContent] = useState('')
  const [saving, setSaving] = useState(false)

  const fetchAssignments = async () => {
    const { data, error } = await supabase
      .from('assignments')
      .select('*, client:clients(name), project:projects(name)')
      .order('created_at', { ascending: false })
    if (error) {
      console.error('Error fetching assignments:', error)
    }
    setAssignments(data || [])
    setLoading(false)
  }

  const fetchProjects = async () => {
    const { data } = await supabase.from('projects').select('id, name').eq('status', 'active').order('name')
    setProjects(data || [])
  }

  const fetchClients = async () => {
    const { data } = await supabase.from('clients').select('id, name').order('name')
    setClients(data || [])
  }

  useEffect(() => {
    fetchAssignments()
    fetchProjects()
    fetchClients()
  }, [])

  // Auto-fill client when project selected
  useEffect(() => {
    if (formProjectId) {
      supabase.from('projects').select('client_id').eq('id', formProjectId).single().then(({ data }) => {
        if (data?.client_id) setFormClientId(data.client_id)
      })
    }
  }, [formProjectId])

  const resetForm = () => {
    setShowForm(false)
    setEditingId(null)
    setFormTitle('')
    setFormProjectId('')
    setFormClientId('')
    setFormContent('')
  }

  const handleEdit = (a: Assignment) => {
    setEditingId(a.id)
    setFormTitle(a.title)
    setFormProjectId(a.project_id)
    setFormClientId(a.client_id)
    setFormContent(a.content || '')
    setShowForm(true)
  }

  const handleSave = async () => {
    if (!formTitle.trim() || !formProjectId || !formClientId) return
    setSaving(true)

    const payload = {
      title: formTitle.trim(),
      project_id: formProjectId,
      client_id: formClientId,
      content: formContent,
    }

    if (editingId) {
      const { error } = await supabase.from('assignments').update(payload).eq('id', editingId)
      if (error) {
        console.error('Error updating assignment:', error)
        alert(`Fout bij opslaan: ${error.message}`)
        setSaving(false)
        return
      }
    } else {
      const { error } = await supabase.from('assignments').insert(payload)
      if (error) {
        console.error('Error creating assignment:', error)
        alert(`Fout bij aanmaken: ${error.message}`)
        setSaving(false)
        return
      }
    }

    setSaving(false)
    resetForm()
    fetchAssignments()
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Weet je zeker dat je deze opdracht wilt verwijderen?')) return
    await supabase.from('assignments').delete().eq('id', id)
    fetchAssignments()
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Opdrachten</h1>
          <p className="text-gray-500 mt-1">Beheer je opdrachtomschrijvingen</p>
        </div>
        <button
          onClick={() => { resetForm(); setShowForm(true) }}
          className="flex items-center gap-2 bg-primary hover:bg-primary-600 text-white px-4 py-2.5 rounded-lg font-medium transition-colors"
        >
          <Plus className="w-4 h-4" />
          Nieuwe opdracht
        </button>
      </div>

      {/* Create/edit form modal */}
      {showForm && (
        <>
          <div className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm" onClick={resetForm} />
          <div className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-[5vh] overflow-y-auto">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between p-6 border-b border-gray-100">
                <h2 className="text-lg font-semibold text-gray-900">
                  {editingId ? 'Opdracht bewerken' : 'Nieuwe opdracht'}
                </h2>
                <button onClick={resetForm} className="p-1 text-gray-400 hover:text-gray-600 transition-colors">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-6 space-y-5">
                {/* Project & Client */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Domein *</label>
                    <select
                      value={formProjectId}
                      onChange={(e) => setFormProjectId(e.target.value)}
                      className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary text-sm transition-all"
                    >
                      <option value="">Kies een domein...</option>
                      {projects.map((p) => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Klant *</label>
                    <select
                      value={formClientId}
                      onChange={(e) => setFormClientId(e.target.value)}
                      className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary text-sm transition-all"
                    >
                      <option value="">Kies een klant...</option>
                      {clients.map((c) => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Title */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Titel *</label>
                  <input
                    type="text"
                    value={formTitle}
                    onChange={(e) => setFormTitle(e.target.value)}
                    placeholder="bijv. Website ontwerp en ontwikkeling"
                    className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary text-sm transition-all"
                  />
                </div>

                {/* Content — rich text */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Opdrachtomschrijving</label>
                  <RichTextEditor
                    value={formContent}
                    onChange={setFormContent}
                    placeholder="Beschrijf de opdracht..."
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3 p-6 border-t border-gray-100">
                <button
                  onClick={resetForm}
                  className="px-4 py-2.5 rounded-xl text-sm text-gray-600 hover:bg-gray-100 transition-colors"
                >
                  Annuleren
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving || !formTitle.trim() || !formProjectId || !formClientId}
                  className="flex items-center gap-2 bg-primary hover:bg-primary-600 text-white px-5 py-2.5 rounded-xl font-medium text-sm transition-colors disabled:opacity-50"
                >
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  {editingId ? 'Opslaan' : 'Aanmaken'}
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* List */}
      {loading ? (
        <div className="space-y-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="bg-white rounded-xl p-6 shadow-sm animate-pulse"><div className="h-16" /></div>
          ))}
        </div>
      ) : assignments.length === 0 ? (
        <div className="bg-white rounded-xl p-12 shadow-sm border border-gray-100 text-center">
          <ClipboardCheck className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900">Nog geen opdrachten</h3>
          <p className="text-gray-500 mt-1">Maak je eerste opdrachtomschrijving aan.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {assignments.map((a) => (
            <div key={a.id} className="bg-white rounded-xl p-6 shadow-sm border border-gray-100 flex items-center justify-between group">
              <div>
                <h3 className="font-semibold text-gray-900">{a.title}</h3>
                <p className="text-sm text-gray-500">
                  {(a.client as unknown as { name: string })?.name} — {(a.project as unknown as { name: string })?.name}
                </p>
                <p className="text-sm text-gray-400 mt-0.5">
                  Aangemaakt: {new Date(a.created_at).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' })}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleEdit(a)}
                  className="p-2 text-gray-400 hover:text-primary transition-colors opacity-0 group-hover:opacity-100"
                  title="Bewerken"
                >
                  <Pencil className="w-4 h-4" />
                </button>
                <button
                  onClick={() => handleDelete(a.id)}
                  className="p-2 text-gray-400 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"
                  title="Verwijderen"
                >
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
