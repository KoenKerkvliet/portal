import { useEffect, useState, useRef } from 'react'
import { supabase } from '../../lib/supabase'
import type { Ticket, TicketReply, TicketStatus } from '../../types'
import { MessageSquare, ArrowLeft, Send, Paperclip, Clock, CheckCircle, AlertCircle, XCircle, Loader2, Image as ImageIcon } from 'lucide-react'

const statusConfig: Record<TicketStatus, { label: string; color: string; bg: string; icon: typeof Clock }> = {
  open: { label: 'Open', color: 'text-blue-700', bg: 'bg-blue-50 border-blue-200', icon: AlertCircle },
  in_progress: { label: 'In behandeling', color: 'text-amber-700', bg: 'bg-amber-50 border-amber-200', icon: Clock },
  resolved: { label: 'Opgelost', color: 'text-green-700', bg: 'bg-green-50 border-green-200', icon: CheckCircle },
  closed: { label: 'Gesloten', color: 'text-gray-500', bg: 'bg-gray-50 border-gray-200', icon: XCircle },
}

const statusOrder: TicketStatus[] = ['open', 'in_progress', 'resolved', 'closed']

export default function Tickets() {
  const [tickets, setTickets] = useState<Ticket[]>([])
  const [loading, setLoading] = useState(true)
  const [filterStatus, setFilterStatus] = useState<TicketStatus | 'all'>('all')
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null)
  const [replies, setReplies] = useState<TicketReply[]>([])
  const [loadingReplies, setLoadingReplies] = useState(false)
  const [replyText, setReplyText] = useState('')
  const [replyFile, setReplyFile] = useState<File | null>(null)
  const [sending, setSending] = useState(false)
  const [updatingStatus, setUpdatingStatus] = useState(false)
  const repliesEndRef = useRef<HTMLDivElement>(null)

  const fetchTickets = async () => {
    const { data } = await supabase
      .from('tickets')
      .select('*, project:projects(name)')
      .order('updated_at', { ascending: false })
    setTickets(data || [])
    setLoading(false)
  }

  useEffect(() => { fetchTickets() }, [])

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

  const updateStatus = async (ticketId: string, status: TicketStatus) => {
    setUpdatingStatus(true)
    const update: Record<string, unknown> = { status, updated_at: new Date().toISOString() }
    if (status === 'resolved') update.resolved_at = new Date().toISOString()
    await supabase.from('tickets').update(update).eq('id', ticketId)

    // Notify client
    if (selectedTicket) {
      await supabase.from('client_notifications').insert({
        project_id: selectedTicket.project_id,
        client_id: null,
        type: 'general',
        title: `Ticket #${String(selectedTicket.number).padStart(3, '0')} — ${statusConfig[status].label}`,
        message: `De status van je ticket "${selectedTicket.title}" is gewijzigd naar "${statusConfig[status].label}".`,
        link_url: null,
        read: false,
      })
      setSelectedTicket({ ...selectedTicket, status })
    }

    setUpdatingStatus(false)
    fetchTickets()
  }

  const sendReply = async () => {
    if (!selectedTicket || !replyText.trim()) return
    setSending(true)

    let attachmentUrl: string | null = null
    if (replyFile) {
      const ext = replyFile.name.split('.').pop() || 'jpg'
      const path = `${selectedTicket.project_id}/${selectedTicket.id}/reply_${Date.now()}.${ext}`
      const { error } = await supabase.storage.from('ticket-attachments').upload(path, replyFile, { upsert: true })
      if (!error) {
        const { data: urlData } = supabase.storage.from('ticket-attachments').getPublicUrl(path)
        attachmentUrl = urlData.publicUrl
      }
    }

    const reply: Partial<TicketReply> = {
      ticket_id: selectedTicket.id,
      author_id: (await supabase.auth.getUser()).data.user?.id || '',
      author_name: 'DesignPixels',
      author_role: 'admin',
      content: replyText.trim(),
      attachment_url: attachmentUrl,
    }

    await supabase.from('ticket_replies').insert(reply)

    // Update ticket timestamp & status to in_progress if still open
    const statusUpdate: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if (selectedTicket.status === 'open') statusUpdate.status = 'in_progress'
    await supabase.from('tickets').update(statusUpdate).eq('id', selectedTicket.id)

    // Notify client
    await supabase.from('client_notifications').insert({
      project_id: selectedTicket.project_id,
      client_id: null,
      type: 'general',
      title: `Reactie op ticket #${String(selectedTicket.number).padStart(3, '0')}`,
      message: `Er is een reactie op je ticket "${selectedTicket.title}".`,
      link_url: null,
      read: false,
    })

    setReplyText('')
    setReplyFile(null)
    setSending(false)
    openTicket({ ...selectedTicket, status: selectedTicket.status === 'open' ? 'in_progress' : selectedTicket.status })
    fetchTickets()
  }

  const filtered = filterStatus === 'all' ? tickets : tickets.filter(t => t.status === filterStatus)
  const counts: Record<string, number> = { all: tickets.length, ...Object.fromEntries(statusOrder.map(s => [s, tickets.filter(t => t.status === s).length])) }

  // Detail view
  if (selectedTicket) {
    const sc = statusConfig[selectedTicket.status]
    return (
      <div className="space-y-6">
        <button onClick={() => { setSelectedTicket(null); fetchTickets() }}
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 transition-colors">
          <ArrowLeft className="w-4 h-4" />
          Terug naar overzicht
        </button>

        {/* Ticket header */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-6 py-5 border-b border-gray-100">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-mono text-gray-400">#{String(selectedTicket.number).padStart(3, '0')}</span>
                  <span className="text-xs text-gray-300">•</span>
                  <span className="text-xs text-gray-400">{(selectedTicket.project as unknown as { name: string })?.name}</span>
                </div>
                <h1 className="text-lg font-bold text-gray-900">{selectedTicket.title}</h1>
                <p className="text-xs text-gray-400 mt-1">
                  Door {selectedTicket.created_by_name} op {new Date(selectedTicket.created_at).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <select
                  value={selectedTicket.status}
                  onChange={(e) => updateStatus(selectedTicket.id, e.target.value as TicketStatus)}
                  disabled={updatingStatus}
                  className={`text-xs font-medium rounded-lg border px-3 py-1.5 cursor-pointer ${sc.bg} ${sc.color}`}
                >
                  {statusOrder.map(s => (
                    <option key={s} value={s}>{statusConfig[s].label}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Conversation thread */}
          <div className="px-6 py-5 space-y-4 max-h-[60vh] overflow-y-auto bg-gray-50/50">
            {/* Original message */}
            <div className="flex justify-start">
              <div className="max-w-[75%]">
                <div className="bg-white rounded-2xl rounded-tl-sm px-4 py-3 shadow-sm border border-gray-100">
                  <p className="text-sm text-gray-700 whitespace-pre-wrap">{selectedTicket.description}</p>
                  {selectedTicket.attachment_url && (
                    <a href={selectedTicket.attachment_url} target="_blank" rel="noopener noreferrer" className="mt-2 block">
                      <img src={selectedTicket.attachment_url} alt="Bijlage" className="max-w-full max-h-48 rounded-lg border border-gray-200" />
                    </a>
                  )}
                </div>
                <p className="text-[10px] text-gray-400 mt-1 px-1">{selectedTicket.created_by_name} • {new Date(selectedTicket.created_at).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })}</p>
              </div>
            </div>

            {/* Replies */}
            {loadingReplies ? (
              <div className="flex justify-center py-4">
                <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
              </div>
            ) : (
              replies.map((reply) => {
                const isAdmin = reply.author_role === 'admin'
                return (
                  <div key={reply.id} className={`flex ${isAdmin ? 'justify-end' : 'justify-start'}`}>
                    <div className="max-w-[75%]">
                      <div className={`rounded-2xl px-4 py-3 ${
                        isAdmin
                          ? 'bg-primary text-white rounded-tr-sm'
                          : 'bg-white rounded-tl-sm shadow-sm border border-gray-100'
                      }`}>
                        <p className={`text-sm whitespace-pre-wrap ${isAdmin ? 'text-white' : 'text-gray-700'}`}>{reply.content}</p>
                        {reply.attachment_url && (
                          <a href={reply.attachment_url} target="_blank" rel="noopener noreferrer" className="mt-2 block">
                            <img src={reply.attachment_url} alt="Bijlage" className="max-w-full max-h-48 rounded-lg border border-white/20" />
                          </a>
                        )}
                      </div>
                      <p className={`text-[10px] text-gray-400 mt-1 px-1 ${isAdmin ? 'text-right' : ''}`}>
                        {reply.author_name} • {new Date(reply.created_at).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })}
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
            <div className="px-6 py-4 border-t border-gray-100 bg-white">
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
                  <button
                    onClick={sendReply}
                    disabled={!replyText.trim() || sending}
                    className="p-2.5 bg-primary text-white rounded-xl hover:bg-primary/90 transition-colors disabled:opacity-50"
                  >
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
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Support</h1>
        <p className="text-sm text-gray-500 mt-1">Beheer tickets en meldingen van klanten.</p>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1">
        {(['all', ...statusOrder] as const).map((s) => {
          const isActive = filterStatus === s
          const label = s === 'all' ? 'Alle' : statusConfig[s].label
          const count = counts[s] || 0
          return (
            <button key={s} onClick={() => setFilterStatus(s)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                isActive ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'
              }`}>
              {label}
              <span className={`px-1.5 py-0.5 rounded-full text-[10px] ${isActive ? 'bg-primary/10 text-primary' : 'bg-gray-200 text-gray-500'}`}>
                {count}
              </span>
            </button>
          )
        })}
      </div>

      {/* Tickets list */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16">
          <div className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <MessageSquare className="w-8 h-8 text-gray-400" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900 mb-1">Geen tickets</h3>
          <p className="text-sm text-gray-500">
            {filterStatus === 'all' ? 'Er zijn nog geen tickets binnengekomen.' : `Geen tickets met status "${statusConfig[filterStatus as TicketStatus].label}".`}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((ticket) => {
            const sc = statusConfig[ticket.status]
            const StatusIcon = sc.icon
            const projectName = (ticket.project as unknown as { name: string })?.name || ''
            return (
              <button key={ticket.id} onClick={() => openTicket(ticket)}
                className="w-full bg-white rounded-xl border border-gray-100 shadow-sm hover:shadow-md transition-shadow p-4 text-left">
                <div className="flex items-start gap-4">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${sc.bg} border`}>
                    <StatusIcon className={`w-5 h-5 ${sc.color}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-xs font-mono text-gray-400">#{String(ticket.number).padStart(3, '0')}</span>
                      <span className={`text-[10px] font-medium rounded px-1.5 py-0.5 border ${sc.bg} ${sc.color}`}>{sc.label}</span>
                    </div>
                    <h3 className="text-sm font-semibold text-gray-900 truncate">{ticket.title}</h3>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-xs text-gray-400">{projectName}</span>
                      <span className="text-xs text-gray-300">•</span>
                      <span className="text-xs text-gray-400">{ticket.created_by_name}</span>
                      <span className="text-xs text-gray-300">•</span>
                      <span className="text-xs text-gray-400">
                        {new Date(ticket.updated_at).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })}
                      </span>
                    </div>
                  </div>
                  {ticket.attachment_url && (
                    <Paperclip className="w-4 h-4 text-gray-300 flex-shrink-0" />
                  )}
                </div>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
