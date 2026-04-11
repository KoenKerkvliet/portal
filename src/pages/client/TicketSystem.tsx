import { useEffect, useState, useRef } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import type { Ticket, TicketReply, TicketStatus } from '../../types'
import { Plus, X, Send, Paperclip, Clock, CheckCircle, AlertCircle, XCircle, Loader2, ArrowLeft, MessageSquare, Image as ImageIcon } from 'lucide-react'
import { sendAdminNotificationEmail } from '../../lib/sendAdminNotificationEmail'

const statusConfig: Record<TicketStatus, { label: string; color: string; bg: string; icon: typeof Clock }> = {
  open: { label: 'Open', color: 'text-blue-700', bg: 'bg-blue-50 border-blue-200', icon: AlertCircle },
  in_progress: { label: 'In behandeling', color: 'text-amber-700', bg: 'bg-amber-50 border-amber-200', icon: Clock },
  resolved: { label: 'Opgelost', color: 'text-green-700', bg: 'bg-green-50 border-green-200', icon: CheckCircle },
  closed: { label: 'Gesloten', color: 'text-gray-500', bg: 'bg-gray-50 border-gray-200', icon: XCircle },
}

interface Props {
  projectId: string
  projectName: string
}

export default function TicketSystem({ projectId, projectName }: Props) {
  const { profile } = useAuth()
  const [tickets, setTickets] = useState<Ticket[]>([])
  const [loading, setLoading] = useState(true)
  const [showNew, setShowNew] = useState(false)
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null)
  const [replies, setReplies] = useState<TicketReply[]>([])
  const [loadingReplies, setLoadingReplies] = useState(false)

  // New ticket form
  const [newTitle, setNewTitle] = useState('')
  const [newDescription, setNewDescription] = useState('')
  const [newFile, setNewFile] = useState<File | null>(null)
  const [creating, setCreating] = useState(false)

  // Reply
  const [replyText, setReplyText] = useState('')
  const [replyFile, setReplyFile] = useState<File | null>(null)
  const [sending, setSending] = useState(false)
  const repliesEndRef = useRef<HTMLDivElement>(null)

  const fetchTickets = async () => {
    const { data } = await supabase
      .from('tickets')
      .select('*')
      .eq('project_id', projectId)
      .order('updated_at', { ascending: false })
    setTickets(data || [])
    setLoading(false)
  }

  useEffect(() => { fetchTickets() }, [projectId])

  const createTicket = async () => {
    if (!newTitle.trim() || !profile) return
    setCreating(true)

    let attachmentUrl: string | null = null
    if (newFile) {
      const ext = newFile.name.split('.').pop() || 'jpg'
      const path = `${projectId}/new_${Date.now()}.${ext}`
      const { error } = await supabase.storage.from('ticket-attachments').upload(path, newFile, { upsert: true })
      if (!error) {
        const { data: urlData } = supabase.storage.from('ticket-attachments').getPublicUrl(path)
        attachmentUrl = urlData.publicUrl
      }
    }

    const { data: ticket } = await supabase.from('tickets').insert({
      project_id: projectId,
      created_by: profile.id,
      created_by_name: profile.full_name || 'Klant',
      title: newTitle.trim(),
      description: newDescription.trim(),
      attachment_url: attachmentUrl,
    }).select().single()

    if (ticket) {
      // Notify admin
      await supabase.from('admin_notifications').insert({
        type: 'general',
        title: `Nieuw ticket #${String(ticket.number).padStart(3, '0')}`,
        message: `${profile.full_name || 'Klant'} heeft een nieuw ticket aangemaakt: "${newTitle.trim()}"`,
        project_id: projectId,
        client_id: null,
      })

      await sendAdminNotificationEmail({
        type: 'ticket',
        itemLabel: `Ticket #${String(ticket.number).padStart(3, '0')}: ${newTitle.trim()}`,
        clientName: profile.full_name || 'Klant',
        projectName,
        ticketDescription: newDescription.trim() || null,
      })
    }

    setNewTitle('')
    setNewDescription('')
    setNewFile(null)
    setShowNew(false)
    setCreating(false)
    fetchTickets()
  }

  const openTicket = async (ticket: Ticket) => {
    setSelectedTicket(ticket)
    setLoadingReplies(true)
    setReplyText('')
    setReplyFile(null)
    const { data } = await supabase
      .from('ticket_replies')
      .select('*')
      .eq('ticket_id', ticket.id)
      .order('created_at', { ascending: true })
    setReplies(data || [])
    setLoadingReplies(false)
    setTimeout(() => repliesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100)
  }

  const sendReply = async () => {
    if (!selectedTicket || !replyText.trim() || !profile) return
    setSending(true)

    let attachmentUrl: string | null = null
    if (replyFile) {
      const ext = replyFile.name.split('.').pop() || 'jpg'
      const path = `${projectId}/${selectedTicket.id}/reply_${Date.now()}.${ext}`
      const { error } = await supabase.storage.from('ticket-attachments').upload(path, replyFile, { upsert: true })
      if (!error) {
        const { data: urlData } = supabase.storage.from('ticket-attachments').getPublicUrl(path)
        attachmentUrl = urlData.publicUrl
      }
    }

    await supabase.from('ticket_replies').insert({
      ticket_id: selectedTicket.id,
      author_id: profile.id,
      author_name: profile.full_name || 'Klant',
      author_role: 'client',
      content: replyText.trim(),
      attachment_url: attachmentUrl,
    })

    await supabase.from('tickets').update({ updated_at: new Date().toISOString() }).eq('id', selectedTicket.id)

    // Notify admin
    await supabase.from('admin_notifications').insert({
      type: 'general',
      title: `Reactie op ticket #${String(selectedTicket.number).padStart(3, '0')}`,
      message: `${profile.full_name || 'Klant'} heeft gereageerd op ticket "${selectedTicket.title}"`,
      project_id: projectId,
      client_id: null,
    })

    setReplyText('')
    setReplyFile(null)
    setSending(false)
    openTicket(selectedTicket)
    fetchTickets()
  }

  // Ticket detail view
  if (selectedTicket) {
    const sc = statusConfig[selectedTicket.status]
    const StatusIcon = sc.icon
    return (
      <div className="max-w-3xl mx-auto">
        <button onClick={() => setSelectedTicket(null)}
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-4 transition-colors">
          <ArrowLeft className="w-4 h-4" />
          Terug naar meldingen
        </button>

        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          {/* Header */}
          <div className="px-6 py-4 border-b border-gray-100">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-mono text-gray-400">#{String(selectedTicket.number).padStart(3, '0')}</span>
                  <span className={`inline-flex items-center gap-1 text-[10px] font-medium rounded px-1.5 py-0.5 border ${sc.bg} ${sc.color}`}>
                    <StatusIcon className="w-3 h-3" />
                    {sc.label}
                  </span>
                </div>
                <h2 className="text-base font-bold text-gray-900">{selectedTicket.title}</h2>
              </div>
            </div>
          </div>

          {/* Conversation */}
          <div className="px-6 py-4 space-y-4 max-h-[50vh] overflow-y-auto bg-gray-50/50">
            {/* Original message */}
            <div className="flex justify-start">
              <div className="max-w-[80%]">
                <div className="bg-white rounded-2xl rounded-tl-sm px-4 py-3 shadow-sm border border-gray-100">
                  <p className="text-sm text-gray-700 whitespace-pre-wrap">{selectedTicket.description}</p>
                  {selectedTicket.attachment_url && (
                    <a href={selectedTicket.attachment_url} target="_blank" rel="noopener noreferrer" className="mt-2 block">
                      <img src={selectedTicket.attachment_url} alt="Bijlage" className="max-w-full max-h-48 rounded-lg border border-gray-200" />
                    </a>
                  )}
                </div>
                <p className="text-[10px] text-gray-400 mt-1 px-1">
                  {selectedTicket.created_by_name} • {new Date(selectedTicket.created_at).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
            </div>

            {loadingReplies ? (
              <div className="flex justify-center py-4">
                <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
              </div>
            ) : (
              replies.map((reply) => {
                const isAdmin = reply.author_role === 'admin'
                return (
                  <div key={reply.id} className={`flex ${isAdmin ? 'justify-start' : 'justify-end'}`}>
                    <div className="max-w-[80%]">
                      <div className={`rounded-2xl px-4 py-3 ${
                        isAdmin
                          ? 'bg-white rounded-tl-sm shadow-sm border border-gray-100'
                          : 'bg-primary text-white rounded-tr-sm'
                      }`}>
                        <p className={`text-sm whitespace-pre-wrap ${isAdmin ? 'text-gray-700' : 'text-white'}`}>{reply.content}</p>
                        {reply.attachment_url && (
                          <a href={reply.attachment_url} target="_blank" rel="noopener noreferrer" className="mt-2 block">
                            <img src={reply.attachment_url} alt="Bijlage" className="max-w-full max-h-48 rounded-lg" />
                          </a>
                        )}
                      </div>
                      <p className={`text-[10px] text-gray-400 mt-1 px-1 ${isAdmin ? '' : 'text-right'}`}>
                        {reply.author_name} • {new Date(reply.created_at).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                  </div>
                )
              })
            )}
            <div ref={repliesEndRef} />
          </div>

          {/* Reply input */}
          {selectedTicket.status !== 'closed' && (
            <div className="px-6 py-4 border-t border-gray-100">
              <div className="flex gap-3">
                <div className="flex-1">
                  <textarea
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    rows={2}
                    className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary text-sm resize-none"
                    placeholder="Typ een reactie..."
                  />
                  {replyFile && (
                    <div className="flex items-center gap-2 mt-2 text-xs text-gray-500">
                      <ImageIcon className="w-3.5 h-3.5" />
                      <span className="truncate">{replyFile.name}</span>
                      <button onClick={() => setReplyFile(null)} className="text-red-400 hover:text-red-600">×</button>
                    </div>
                  )}
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="p-2.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-xl cursor-pointer transition-colors" title="Bijlage">
                    <Paperclip className="w-4 h-4" />
                    <input type="file" accept="image/*" className="hidden" onChange={(e) => setReplyFile(e.target.files?.[0] || null)} />
                  </label>
                  <button onClick={sendReply} disabled={!replyText.trim() || sending}
                    className="p-2.5 bg-primary text-white rounded-xl hover:bg-primary/90 transition-colors disabled:opacity-50">
                    {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    )
  }

  // List view
  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Support & Meldingen</h2>
          <p className="text-sm text-gray-500 mt-1">Heb je een vraag of probleem? Maak een melding aan.</p>
        </div>
        <button onClick={() => setShowNew(true)}
          className="flex items-center gap-2 bg-primary hover:bg-primary/90 text-white px-4 py-2.5 rounded-xl text-sm font-medium transition-colors">
          <Plus className="w-4 h-4" />
          Nieuwe melding
        </button>
      </div>

      {/* New ticket modal */}
      {showNew && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-start justify-center pt-16 px-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h3 className="text-lg font-bold text-gray-900">Nieuwe melding</h3>
              <button onClick={() => { setShowNew(false); setNewTitle(''); setNewDescription(''); setNewFile(null) }}
                className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Onderwerp</label>
                <input type="text" value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary text-sm"
                  placeholder="Waar gaat het over?" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Beschrijving</label>
                <textarea value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  rows={4}
                  className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary text-sm resize-none"
                  placeholder="Beschrijf je vraag of probleem..." />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Bijlage (optioneel)</label>
                {newFile ? (
                  <div className="flex items-center gap-2 px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl">
                    <ImageIcon className="w-4 h-4 text-gray-400" />
                    <span className="text-sm text-gray-600 truncate flex-1">{newFile.name}</span>
                    <button onClick={() => setNewFile(null)} className="text-red-400 hover:text-red-600 text-sm">Verwijderen</button>
                  </div>
                ) : (
                  <label className="flex items-center justify-center gap-2 w-full py-4 border-2 border-dashed border-gray-200 rounded-xl cursor-pointer hover:border-primary hover:bg-gray-50 transition-colors">
                    <Paperclip className="w-4 h-4 text-gray-400" />
                    <span className="text-sm text-gray-500">Klik om een afbeelding toe te voegen</span>
                    <input type="file" accept="image/*" className="hidden" onChange={(e) => setNewFile(e.target.files?.[0] || null)} />
                  </label>
                )}
              </div>
            </div>
            <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-100 bg-gray-50/50 rounded-b-2xl">
              <button onClick={() => { setShowNew(false); setNewTitle(''); setNewDescription(''); setNewFile(null) }}
                className="px-4 py-2.5 text-sm font-medium text-gray-600 hover:text-gray-800 transition-colors">
                Annuleren
              </button>
              <button onClick={createTicket} disabled={!newTitle.trim() || creating}
                className="flex items-center gap-2 bg-primary hover:bg-primary/90 text-white px-5 py-2.5 rounded-xl text-sm font-medium transition-colors disabled:opacity-50">
                {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                {creating ? 'Verzenden...' : 'Melding versturen'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Tickets list */}
      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      ) : tickets.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-10 text-center">
          <div className="w-16 h-16 bg-primary/5 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <MessageSquare className="w-8 h-8 text-primary/40" />
          </div>
          <h3 className="text-base font-semibold text-gray-900 mb-1">Geen meldingen</h3>
          <p className="text-sm text-gray-500 mb-4">Je hebt nog geen meldingen aangemaakt.</p>
          <button onClick={() => setShowNew(true)}
            className="inline-flex items-center gap-2 bg-primary hover:bg-primary/90 text-white px-4 py-2.5 rounded-xl text-sm font-medium transition-colors">
            <Plus className="w-4 h-4" />
            Eerste melding aanmaken
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {tickets.map((ticket) => {
            const sc = statusConfig[ticket.status]
            const StatusIcon = sc.icon
            return (
              <button key={ticket.id} onClick={() => openTicket(ticket)}
                className="w-full bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-shadow p-4 text-left">
                <div className="flex items-center gap-4">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${sc.bg} border`}>
                    <StatusIcon className={`w-5 h-5 ${sc.color}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-xs font-mono text-gray-400">#{String(ticket.number).padStart(3, '0')}</span>
                      <span className={`text-[10px] font-medium rounded px-1.5 py-0.5 border ${sc.bg} ${sc.color}`}>{sc.label}</span>
                    </div>
                    <h3 className="text-sm font-semibold text-gray-900 truncate">{ticket.title}</h3>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {ticket.created_by_name} • {new Date(ticket.updated_at).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })}
                    </p>
                  </div>
                  {ticket.attachment_url && <Paperclip className="w-4 h-4 text-gray-300 flex-shrink-0" />}
                </div>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
