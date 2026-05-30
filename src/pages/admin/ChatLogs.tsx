import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { MessageCircle, ArrowLeft, Loader2, AlertTriangle, Trash2 } from 'lucide-react'

interface Conversation {
  id: string
  client_name: string
  project_name: string
  message_count: number
  has_unresolved: boolean
  created_at: string
  last_message_at: string
}

interface ChatMessageRow {
  id: string
  role: 'user' | 'assistant'
  content: string
  is_unresolved: boolean
  created_at: string
}

export default function ChatLogs() {
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'unresolved'>('all')
  const [selected, setSelected] = useState<Conversation | null>(null)
  const [messages, setMessages] = useState<ChatMessageRow[]>([])
  const [loadingMessages, setLoadingMessages] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const fetchConversations = async () => {
    const { data } = await supabase
      .from('chat_conversations')
      .select('id, client_name, project_name, message_count, has_unresolved, created_at, last_message_at')
      .order('last_message_at', { ascending: false })
    setConversations(data || [])
    setLoading(false)
  }

  useEffect(() => { fetchConversations() }, [])

  const openConversation = async (conv: Conversation) => {
    setSelected(conv)
    setLoadingMessages(true)
    const { data } = await supabase
      .from('chat_messages')
      .select('id, role, content, is_unresolved, created_at')
      .eq('conversation_id', conv.id)
      .order('created_at', { ascending: true })
    setMessages(data || [])
    setLoadingMessages(false)
  }

  const deleteConversation = async (conv: Conversation) => {
    if (!confirm(`Dit gesprek met ${conv.client_name || 'onbekende klant'} verwijderen?`)) return
    setDeleting(true)
    await supabase.from('chat_conversations').delete().eq('id', conv.id)
    setDeleting(false)
    setSelected(null)
    fetchConversations()
  }

  const filtered = filter === 'all' ? conversations : conversations.filter((c) => c.has_unresolved)
  const unresolvedCount = conversations.filter((c) => c.has_unresolved).length

  // Detail view
  if (selected) {
    return (
      <div className="space-y-6">
        <button onClick={() => { setSelected(null); fetchConversations() }}
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 transition-colors">
          <ArrowLeft className="w-4 h-4" />
          Terug naar overzicht
        </button>

        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-6 py-5 border-b border-gray-100 flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <h1 className="text-lg font-bold text-gray-900">{selected.client_name || 'Onbekende klant'}</h1>
                {selected.has_unresolved && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-medium rounded px-1.5 py-0.5 border bg-amber-50 border-amber-200 text-amber-700">
                    <AlertTriangle className="w-3 h-3" /> Niet beantwoord
                  </span>
                )}
              </div>
              <p className="text-xs text-gray-400">
                {selected.project_name || 'geen project'} • {new Date(selected.created_at).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
              </p>
            </div>
            <button
              onClick={() => deleteConversation(selected)}
              disabled={deleting}
              className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-red-600 transition-colors px-2 py-1.5 rounded-lg hover:bg-red-50 disabled:opacity-50"
            >
              {deleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
              Verwijderen
            </button>
          </div>

          <div className="px-6 py-5 space-y-4 max-h-[65vh] overflow-y-auto bg-gray-50/50">
            {loadingMessages ? (
              <div className="flex justify-center py-4">
                <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
              </div>
            ) : messages.length === 0 ? (
              <p className="text-center text-sm text-gray-400 py-4">Geen berichten in dit gesprek.</p>
            ) : (
              messages.map((msg) => {
                const isUser = msg.role === 'user'
                return (
                  <div key={msg.id} className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
                    <div className="max-w-[75%]">
                      <div className={`rounded-2xl px-4 py-3 ${
                        isUser
                          ? 'bg-primary text-white rounded-tr-sm'
                          : msg.is_unresolved
                            ? 'bg-amber-50 border border-amber-200 rounded-tl-sm'
                            : 'bg-white rounded-tl-sm shadow-sm border border-gray-100'
                      }`}>
                        <p className={`text-sm whitespace-pre-wrap ${isUser ? 'text-white' : 'text-gray-700'}`}>{msg.content}</p>
                        {msg.is_unresolved && (
                          <p className="mt-2 flex items-center gap-1 text-[10px] font-medium text-amber-700">
                            <AlertTriangle className="w-3 h-3" /> Kon dit niet beantwoorden
                          </p>
                        )}
                      </div>
                      <p className={`text-[10px] text-gray-400 mt-1 px-1 ${isUser ? 'text-right' : ''}`}>
                        {isUser ? 'Klant' : 'Assistent'} • {new Date(msg.created_at).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>
      </div>
    )
  }

  // List view
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Chatgesprekken</h1>
        <p className="text-sm text-gray-500 mt-1">Bekijk wat klanten aan de assistent vragen. Gesprekken waarbij de assistent het antwoord niet wist, zijn apart uitgelicht — handig om je kennisbank aan te vullen.</p>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 w-fit">
        {([
          { id: 'all' as const, label: 'Alle', count: conversations.length },
          { id: 'unresolved' as const, label: 'Niet beantwoord', count: unresolvedCount },
        ]).map((tab) => {
          const isActive = filter === tab.id
          return (
            <button key={tab.id} onClick={() => setFilter(tab.id)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                isActive ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'
              }`}>
              {tab.label}
              <span className={`px-1.5 py-0.5 rounded-full text-[10px] ${isActive ? 'bg-primary/10 text-primary' : 'bg-gray-200 text-gray-500'}`}>
                {tab.count}
              </span>
            </button>
          )
        })}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16">
          <div className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <MessageCircle className="w-8 h-8 text-gray-400" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900 mb-1">Geen gesprekken</h3>
          <p className="text-sm text-gray-500">
            {filter === 'all' ? 'Er zijn nog geen chatgesprekken gevoerd.' : 'Geen gesprekken die de assistent niet kon beantwoorden.'}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((conv) => (
            <button key={conv.id} onClick={() => openConversation(conv)}
              className="w-full bg-white rounded-xl border border-gray-100 shadow-sm hover:shadow-md transition-shadow p-4 text-left">
              <div className="flex items-start gap-4">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 border ${
                  conv.has_unresolved ? 'bg-amber-50 border-amber-200' : 'bg-primary/10 border-primary/20'
                }`}>
                  {conv.has_unresolved
                    ? <AlertTriangle className="w-5 h-5 text-amber-600" />
                    : <MessageCircle className="w-5 h-5 text-primary" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <h3 className="text-sm font-semibold text-gray-900 truncate">{conv.client_name || 'Onbekende klant'}</h3>
                    {conv.has_unresolved && (
                      <span className="text-[10px] font-medium rounded px-1.5 py-0.5 border bg-amber-50 border-amber-200 text-amber-700">Niet beantwoord</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-400">{conv.project_name || 'geen project'}</span>
                    <span className="text-xs text-gray-300">•</span>
                    <span className="text-xs text-gray-400">{conv.message_count} {conv.message_count === 1 ? 'bericht' : 'berichten'}</span>
                    <span className="text-xs text-gray-300">•</span>
                    <span className="text-xs text-gray-400">
                      {new Date(conv.last_message_at).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
