import { useCallback, useEffect, useState } from 'react'
import { KeyRound, Loader2, Mail, MailX } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import type { ProjectClient } from '../../types'
import HelpTip from '../HelpTip'

interface AccessRow {
  client_id: string
  has_account: boolean
  invited_at: string | null
  invite_expires_at: string | null
  invite_used_at: string | null
  last_sign_in_at: string | null
}

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' })

type Status = { label: string; className: string; detail?: string }

// Op inloggen gebaseerd, niet op een wachtwoord: klanten loggen standaard in met een
// code per mail, dus een uitnodiging kan niet 'verlopen'.
function accessStatus(row: AccessRow | undefined): Status {
  if (!row?.has_account) return { label: 'Geen toegang', className: 'bg-gray-100 text-gray-600' }
  if (row.last_sign_in_at) {
    return { label: 'Actief', className: 'bg-green-50 text-green-700', detail: `Laatst ingelogd op ${formatDate(row.last_sign_in_at)}` }
  }
  if (row.invited_at) {
    return { label: 'Uitgenodigd', className: 'bg-blue-50 text-blue-700', detail: `Op ${formatDate(row.invited_at)}; nog niet ingelogd.` }
  }
  return { label: 'Account', className: 'bg-blue-50 text-blue-700', detail: 'Nog niet ingelogd.' }
}

// Wie van de klanten van dit domein in het portaal kan (o.a. voor de strippenkaart)
export default function DomainPortalAccess({ projectId, projectClients }: { projectId: string; projectClients: ProjectClient[] }) {
  const [rows, setRows] = useState<Record<string, AccessRow>>({})
  const [loading, setLoading] = useState(true)
  const [invitingId, setInvitingId] = useState<string | null>(null)
  // Klant waarvoor de keuze 'met / zonder uitnodigingsmail' openstaat
  const [choosingId, setChoosingId] = useState<string | null>(null)

  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc('project_portal_access', { p_project_id: projectId })
    if (error) console.error('Portaaltoegang laden mislukt:', error)
    setRows(Object.fromEntries(((data || []) as AccessRow[]).map(r => [r.client_id, r])))
    setLoading(false)
  }, [projectId])

  // Opnieuw laden als er klanten bij of af gaan
  const clientKey = projectClients.map(pc => pc.client_id).join(',')
  useEffect(() => {
    const run = async () => { await load() }
    run()
  }, [load, clientKey])

  const invite = async (pc: ProjectClient, sendEmail: boolean) => {
    const client = pc.client as unknown as { name: string; email: string } | undefined
    if (!client?.email) {
      alert('Deze klant heeft geen e-mailadres. Voeg er eerst eentje toe op de Klanten-pagina.')
      return
    }
    const question = sendEmail
      ? `Stuur ${client.name} een uitnodiging voor het portaal?\n\nEr wordt een account aangemaakt op ${client.email}. De klant krijgt een mail met uitleg hoe hij zonder wachtwoord inlogt (met een code per mail), en een link om eventueel toch een wachtwoord in te stellen.`
      : `Account aanmaken voor ${client.name}, zonder mail?\n\nEr wordt een account aangemaakt op ${client.email}. De klant krijgt géén mail, maar kan meteen inloggen met een code per mail als hij zelf naar het portaal gaat.`
    if (!confirm(question)) return

    setChoosingId(null)
    setInvitingId(pc.client_id)
    const { data, error } = await supabase.functions.invoke('invite-client', { body: { client_id: pc.client_id, send_email: sendEmail } })
    setInvitingId(null)
    if (error || !data?.success) {
      alert('Uitnodiging versturen mislukt: ' + (data?.error || error?.message || 'onbekende fout'))
      return
    }
    await load()
  }

  return (
    <div>
      <div className="flex items-center gap-1.5 mb-2">
        <KeyRound className="w-3.5 h-3.5 text-gray-400" />
        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Portaaltoegang</span>
        <HelpTip text="In de onderhoudsfase loggen klanten in om hun strippenkaarten te bekijken en nieuwe te kopen. Hier zie je per klant van dit domein of dat kan, en stuur je een uitnodiging als er nog geen account is. De klant logt in met een code per mail (geen wachtwoord nodig), of stelt via de link in de uitnodiging toch een wachtwoord in. Kies 'Zonder mail' om alleen het account aan te maken: de klant krijgt dan niets, maar kan wel inloggen (bijv. via de link in de strippenmail). Klanten die al met een wachtwoord inloggen, merken hier niets van." />
      </div>
      {projectClients.length === 0 ? (
        <p className="text-xs text-gray-400">Er is nog geen klant aan dit domein gekoppeld (zie Algemeen).</p>
      ) : loading ? (
        <div className="flex py-3"><Loader2 className="w-4 h-4 animate-spin text-gray-300" /></div>
      ) : (
        <div className="border border-gray-200 rounded-md divide-y divide-gray-100">
          {projectClients.map((pc) => {
            const client = pc.client as unknown as { name: string; email: string } | undefined
            const row = rows[pc.client_id]
            const status = accessStatus(row)
            return (
              <div key={pc.id} className="flex items-center gap-3 px-3 py-2 flex-wrap sm:flex-nowrap">
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-2">
                    <span className="text-sm font-medium text-gray-800 truncate">{client?.name || 'Onbekend'}</span>
                    <span className="text-xs text-gray-400 truncate">{client?.email}</span>
                  </div>
                  {status.detail && <p className="text-[11px] text-gray-500 mt-0.5">{status.detail}</p>}
                </div>
                <span className={`flex-shrink-0 px-2 py-0.5 rounded text-[11px] font-medium ${status.className}`}>{status.label}</span>
                {!row?.has_account && (choosingId === pc.client_id ? (
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button type="button" onClick={() => invite(pc, true)}
                      className="inline-flex items-center gap-1.5 h-8 px-3 text-xs font-medium text-white bg-primary hover:bg-primary-600 rounded-md transition-colors">
                      <Mail className="w-3.5 h-3.5" />
                      Met uitnodiging
                    </button>
                    <button type="button" onClick={() => invite(pc, false)}
                      className="inline-flex items-center gap-1.5 h-8 px-3 text-xs font-medium text-gray-700 bg-white border border-gray-200 hover:bg-gray-50 rounded-md transition-colors">
                      <MailX className="w-3.5 h-3.5" />
                      Zonder mail
                    </button>
                    <button type="button" onClick={() => setChoosingId(null)} className="text-xs text-gray-400 hover:text-gray-600 px-1">
                      Annuleren
                    </button>
                  </div>
                ) : (
                  <button type="button" onClick={() => setChoosingId(pc.client_id)} disabled={invitingId === pc.client_id}
                    className="flex-shrink-0 inline-flex items-center gap-1.5 h-8 px-3 text-xs font-medium text-white bg-primary hover:bg-primary-600 rounded-md transition-colors disabled:opacity-40">
                    {invitingId === pc.client_id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <KeyRound className="w-3.5 h-3.5" />}
                    Geef toegang
                  </button>
                ))}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
