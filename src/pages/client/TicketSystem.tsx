import { useEffect, useState, useRef } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import type { Ticket, TicketReply } from '../../types'
import { Plus, X, Send, Paperclip, Clock, CheckCircle, AlertCircle, Loader2, ArrowLeft, MessageSquare, Image as ImageIcon } from 'lucide-react'
import { sendAdminNotificationEmail } from '../../lib/sendAdminNotificationEmail'
import { ticketAttachmentPath, uploadTicketAttachment } from '../../lib/ticketAttachments'
import TicketAttachment from '../../components/TicketAttachment'

const statusConfig: Record<string, { label: string; color: string; bg: string; icon: typeof Clock }> = {
  open: { label: 'Open', color: 'text-blue-700', bg: 'bg-blue-50 border-blue-200', icon: AlertCircle },
  in_progress: { label: 'In behandeling', color: 'text-amber-700', bg: 'bg-amber-50 border-amber-200', icon: Clock },
  resolved: { label: 'Opgelost', color: 'text-green-700', bg: 'bg-green-50 border-green-200', icon: CheckCircle },
}

const fallbackStatus = { label: 'Onbekend', color: 'text-gray-500', bg: 'bg-gray-50 border-gray-200', icon: Clock }

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
  const [newError, setNewError] = useState('')

  // Reply
  const [replyText, setReplyText] = useState('')
  const [replyFile, setReplyFile] = useState<File | null>(null)
  const [sending, setSending] = useState(false)
  const [replyError, setReplyError] = useState('')
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
    setNewError('')

    // Bijlage eerst: als die niet lukt maken we het ticket niet aan, zodat de
    // klant kan kiezen tussen opnieuw proberen of de bijlage weglaten.
    let attachmentUrl: string | null = null
    if (newFile) {
      const { path, error } = await uploadTicketAttachment(newFile, ticketAttachmentPath(projectId, null, newFile))
      if (error) {
        setNewError(`${error} Probeer het opnieuw of verstuur de melding zonder bijlage.`)
        setCreating(false)
        return
      }
      attachmentUrl = path
    }

    const { data: ticket, error: ticketError } = await supabase.from('tickets').insert({
      project_id: projectId,
      created_by: profile.id,
      created_by_name: profile.full_name || 'Klant',
      title: newTitle.trim(),
      description: newDescription.trim(),
      attachment_url: attachmentUrl,
    }).select().single()

    if (ticketError || !ticket) {
      setNewError(`Melding versturen mislukt: ${ticketError?.message || 'onbekende fout'}`)
      setCreating(false)
      return
    }

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
    setReplyError('')
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
    setReplyError('')

    let attachmentUrl: string | null = null
    if (replyFile) {
      const { path, error } = await uploadTicketAttachment(
        replyFile,
        ticketAttachmentPath(projectId, selectedTicket.id, replyFile)
      )
      if (error) {
        setReplyError(`${error} Probeer het opnieuw of verstuur je reactie zonder bijlage.`)
        setSending(false)
        return
      }
      attachmentUrl = path
    }

    const { error: replyInsertError } = await supabase.from('ticket_replies').insert({
      ticket_id: selectedTicket.id,
      author_id: profile.id,
      author_name: profile.full_name || 'Klant',
      author_role: 'client',
      content: replyText.trim(),
      attachment_url: attachmentUrl,
    })

    if (replyInsertError) {
      setReplyError(`Reactie versturen mislukt: ${replyInsertError.message}`)
      setSending(false)
      return
    }

    await supabase.from('tickets').update({ updated_at: new Date().toISOString() }).eq('id', selectedTicket.id)

    // Notify admin (in-app always)
    const ticketNumber = `#${String(selectedTicket.number).padStart(3, '0')}`
    await supabase.from('admin_notifications').insert({
      type: 'general',
      title: `Reactie op ticket ${ticketNumber}`,
      message: `${profile.full_name || 'Klant'} heeft gereageerd op ticket "${selectedTicket.title}"`,
      project_id: projectId,
      client_id: null,
    })

    // Email throttle: only send if no client reply in last 5 minutes
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString()
    const { data: recentReplies } = await supabase
      .from('ticket_replies')
      .select('id')
      .eq('ticket_id', selectedTicket.id)
      .eq('author_role', 'client')
      .gte('created_at', fiveMinAgo)
      .limit(2)

    // Only send email if this is the first client reply in 5 min (the one we just inserted counts as 1)
    if (!recentReplies || recentReplies.length <= 1) {
      await sendAdminNotificationEmail({
        type: 'ticket',
        itemLabel: `Ticket ${ticketNumber}: ${selectedTicket.title}`,
        clientName: profile.full_name || 'Klant',
        projectName,
        ticketDescription: replyText.trim(),
      })
    }

    setReplyText('')
    setReplyFile(null)
    setSending(false)
    openTicket(selectedTicket)
    fetchTickets()
  }

  // Ticket detail view
  if (selectedTicket) {
    const sc = (statusConfig[selectedTicket.status] || fallbackStatus)
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
            {/* Original message — right if own, left if other client */}
            {(() => {
              const isOwnMessage = selectedTicket.created_by === profile?.id
              return (
                <div className={`flex ${isOwnMessage ? 'justify-end' : 'justify-start'}`}>
                  <div className="max-w-[80%]">
                    <div className={`rounded-2xl px-4 py-3 ${
                      isOwnMessage
                        ? 'bg-primary text-white rounded-tr-sm'
                        : 'bg-white rounded-tl-sm shadow-sm border border-gray-100'
                    }`}>
                      <p className={`text-sm whitespace-pre-wrap ${isOwnMessage ? 'text-white' : 'text-gray-700'}`}>{selectedTicket.description}</p>
                      {selectedTicket.attachment_url && (
                        <TicketAttachment value={selectedTicket.attachment_url} />
                      )}
                    </div>
                    <p className={`text-[10px] text-gray-400 mt-1 px-1 ${isOwnMessage ? 'text-right' : ''}`}>
                      {selectedTicket.created_by_name} • {new Date(selectedTicket.created_at).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                </div>
              )
            })()}

            {loadingReplies ? (
              <div className="flex justify-center py-4">
                <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
              </div>
            ) : (
              replies.map((reply) => {
                const isOwn = reply.author_id === profile?.id
                return (
                  <div key={reply.id} className={`flex ${isOwn ? 'justify-end' : 'justify-start'}`}>
                    <div className="max-w-[80%]">
                      <div className={`rounded-2xl px-4 py-3 ${
                        isOwn
                          ? 'bg-primary text-white rounded-tr-sm'
                          : 'bg-white rounded-tl-sm shadow-sm border border-gray-100'
                      }`}>
                        <p className={`text-sm whitespace-pre-wrap ${isOwn ? 'text-white' : 'text-gray-700'}`}>{reply.content}</p>
                        {reply.attachment_url && <TicketAttachment value={reply.attachment_url} />}
                      </div>
                      <p className={`text-[10px] text-gray-400 mt-1 px-1 ${isOwn ? 'text-right' : ''}`}>
                        {reply.author_name} • {new Date(reply.created_at).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                  </div>
                )
              })
            )}
            <div ref={repliesEndRef} />
          </div>

          {/* Resolved message */}
          {selectedTicket.status === 'resolved' && (
            <div className="px-6 py-5 border-t border-gray-100 bg-green-50/50 text-center">
              <CheckCircle className="w-6 h-6 text-green-500 mx-auto mb-2" />
              <p className="text-sm font-medium text-gray-800">Dit ticket is opgelost</p>
              <p className="text-xs text-gray-500 mt-1">Heb je nog een vraag? Maak dan een nieuwe melding aan.</p>
            </div>
          )}

          {/* Reply input */}
          {selectedTicket.status !== 'resolved' && (
            <div className="px-6 py-4 border-t border-gray-100">
              <p className="text-[11px] text-gray-400 mb-2">Beschrijf alles in één bericht zodat we je zo goed mogelijk kunnen helpen.</p>
              <div className="flex gap-3">
                <div className="flex-1">
                  <textarea
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    rows={4}
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary text-sm resize-y"
                    placeholder="Beschrijf je vraag of opmerking zo volledig mogelijk..."
                  />
                  {replyFile && (
                    <div className="flex items-center gap-2 mt-2 text-xs text-gray-500">
                      <ImageIcon className="w-3.5 h-3.5" />
                      <span className="truncate">{replyFile.name}</span>
                      <button onClick={() => setReplyFile(null)} className="text-red-400 hover:text-red-600">×</button>
                    </div>
                  )}
                  {replyError && (
                    <p className="mt-2 text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                      {replyError}
                    </p>
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
        <button onClick={() => { setShowNew(true); setNewError('') }}
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
              <button onClick={() => { setShowNew(false); setNewTitle(''); setNewDescription(''); setNewFile(null); setNewError('') }}
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
            {newError && (
              <div className="px-6 pb-4 -mt-1">
                <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{newError}</p>
              </div>
            )}
            <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-100 bg-gray-50/50 rounded-b-2xl">
              <button onClick={() => { setShowNew(false); setNewTitle(''); setNewDescription(''); setNewFile(null); setNewError('') }}
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
          <button onClick={() => { setShowNew(true); setNewError('') }}
            className="inline-flex items-center gap-2 bg-primary hover:bg-primary/90 text-white px-4 py-2.5 rounded-xl text-sm font-medium transition-colors">
            <Plus className="w-4 h-4" />
            Eerste melding aanmaken
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {tickets.map((ticket) => {
            const sc = (statusConfig[ticket.status] || fallbackStatus)
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
