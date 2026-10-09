import { useCallback, useEffect, useState } from 'react'
import { FunctionsHttpError } from '@supabase/supabase-js'
import { CheckCircle, Download, ExternalLink, ListChecks, Loader2, Pencil, Send, Trash2 } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import type { Form, FormSubmission } from '../../types'
import HelpTip from '../HelpTip'
import { downloadFormAnswersPdf } from '../../lib/formPdf'

const formatDateTime = (iso: string) =>
  new Date(iso).toLocaleString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })

const hasAnswers = (sub: FormSubmission) => !!sub.data && Object.keys(sub.data).length > 0

// Vragenlijsten (uit Formulieren) koppelen aan een domein en mailen met een link om ze
// zonder inloggen in te vullen. Koppelen stuurt niets; ingevulde antwoorden download je als PDF.
export default function DomainForms({ projectId, projectName }: { projectId: string; projectName: string }) {
  const [forms, setForms] = useState<Form[]>([])
  const [submissions, setSubmissions] = useState<FormSubmission[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [results, setResults] = useState<Record<string, string>>({})

  const load = useCallback(async () => {
    const [{ data: formData }, { data: subData }] = await Promise.all([
      supabase.from('forms').select('*').order('title'),
      supabase.from('form_submissions').select('*').eq('project_id', projectId).order('created_at'),
    ])
    setForms((formData || []) as Form[])
    setSubmissions((subData || []) as FormSubmission[])
    setLoading(false)
  }, [projectId])

  useEffect(() => {
    const run = async () => { await load() }
    run()
  }, [load])

  const formById = new Map(forms.map(f => [f.id, f]))
  const available = forms.filter(f => !submissions.some(s => s.form_id === f.id))

  const link = async (formId: string) => {
    if (!formId) return
    const { error } = await supabase.from('form_submissions').insert({ form_id: formId, project_id: projectId, data: {} })
    if (error) alert('Koppelen mislukt: ' + error.message)
    await load()
  }

  const unlink = async (sub: FormSubmission) => {
    const title = formById.get(sub.form_id)?.title || 'deze vragenlijst'
    const warning = hasAnswers(sub)
      ? `"${title}" ontkoppelen?\n\nLet op: de klant heeft al antwoorden ingevuld. Die worden verwijderd. Download ze eventueel eerst als PDF.`
      : `"${title}" ontkoppelen van dit domein?`
    if (!confirm(warning)) return
    await supabase.from('form_submissions').delete().eq('id', sub.id)
    await load()
  }

  const send = async (sub: FormSubmission) => {
    const title = formById.get(sub.form_id)?.title || 'De vragenlijst'
    const again = sub.last_sent_at ? `\n\nLet op: deze vragenlijst is al gemaild op ${new Date(sub.last_sent_at).toLocaleString('nl-NL')}.` : ''
    if (!confirm(`"${title}" nu naar de klant mailen?${again}`)) return

    setBusyId(sub.id)
    setResults(prev => ({ ...prev, [sub.id]: '' }))
    const { data, error } = await supabase.functions.invoke('send-form-email', { body: { submission_id: sub.id } })
    setBusyId(null)
    let failure = ''
    if (error) {
      failure = 'Versturen mislukt.'
      if (error instanceof FunctionsHttpError) {
        try { failure = (await error.context.json())?.error || failure } catch { /* standaardmelding */ }
      }
    } else if (!data?.success) {
      failure = data?.error || 'Versturen mislukt.'
    } else if (![data.sent_to].flat().filter(Boolean).length) {
      failure = "er is geen klant met 'Portaalmails' aan. Zet dat aan bij een klant onder Algemeen."
    }
    if (failure) {
      alert(`De vragenlijst is niet verstuurd: ${failure}`)
      return
    }
    setResults(prev => ({ ...prev, [sub.id]: `Gemaild naar ${[data.sent_to].flat().join(', ')}` }))
    await load()
  }

  const download = async (sub: FormSubmission) => {
    const form = formById.get(sub.form_id)
    if (!form) return
    await downloadFormAnswersPdf({ form, answers: sub.data || {}, projectName, submittedAt: sub.submitted_at })
  }

  return (
    <div>
      <div className="flex items-center gap-1.5 mb-1">
        <ListChecks className="w-3.5 h-3.5 text-gray-400" />
        <span className="text-[11px] font-medium text-gray-500 uppercase tracking-wider">Vragenlijsten</span>
        <HelpTip text="Koppel een vragenlijst uit Formulieren. Koppelen stuurt niets. Met 'Mail sturen' krijgt de klant een link om de vragenlijst zonder inloggen in te vullen; tussentijds wordt alles bewaard, zodat de klant later via dezelfde link verder kan. Is de vragenlijst ingestuurd, dan krijg je een melding en download je de vragen met antwoorden als PDF. De mail gaat naar gekoppelde klanten met 'Portaalmails' aan." />
      </div>

      {loading ? (
        <div className="flex py-2"><Loader2 className="w-4 h-4 animate-spin text-gray-300" /></div>
      ) : (
        <div className="space-y-2">
          {submissions.map((sub) => {
            const form = formById.get(sub.form_id)
            const submitted = !!sub.submitted_at
            return (
              <div key={sub.id} className="rounded-md border border-gray-200 bg-white px-3 py-2">
                <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
                  <span className="flex-1 min-w-0 text-sm font-medium text-gray-800 truncate">{form?.title || 'Onbekende vragenlijst'}</span>
                  {submitted ? (
                    <button type="button" onClick={() => download(sub)}
                      className="flex-shrink-0 inline-flex items-center gap-1.5 h-8 px-3 text-xs font-medium text-white bg-green-600 hover:bg-green-700 rounded-md transition-colors">
                      <Download className="w-3.5 h-3.5" />
                      Antwoorden (PDF)
                    </button>
                  ) : (
                    <button type="button" onClick={() => send(sub)} disabled={busyId === sub.id}
                      className="flex-shrink-0 inline-flex items-center gap-1.5 h-8 px-3 text-xs font-medium text-white bg-primary hover:bg-primary-600 rounded-md transition-colors disabled:opacity-40">
                      {busyId === sub.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                      {sub.last_sent_at ? 'Opnieuw mailen' : 'Mail sturen'}
                    </button>
                  )}
                  <button type="button" onClick={() => unlink(sub)} title="Ontkoppelen"
                    className="flex-shrink-0 p-1.5 text-gray-300 hover:text-red-500 rounded-md hover:bg-red-50 transition-colors">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div className="flex items-center gap-x-3 gap-y-1 flex-wrap mt-1 text-[11px] text-gray-500">
                  {submitted ? (
                    <span className="flex items-center gap-1 text-green-700 font-medium"><CheckCircle className="w-3 h-3" />Ingevuld op {formatDateTime(sub.submitted_at!)}</span>
                  ) : hasAnswers(sub) ? (
                    <span className="flex items-center gap-1 text-amber-600 font-medium"><Pencil className="w-3 h-3" />Bezig met invullen{sub.updated_at ? `, laatst op ${formatDateTime(sub.updated_at)}` : ''}</span>
                  ) : (
                    <span>{sub.last_sent_at ? 'Nog niet ingevuld' : 'Nog niet gemaild'}</span>
                  )}
                  {sub.last_sent_at && <span>Gemaild op {formatDateTime(sub.last_sent_at)}</span>}
                  {sub.public_token && (
                    <a href={`/d/vragenlijst/${sub.public_token}`} target="_blank" rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-primary hover:text-primary-600">
                      Bekijk als klant <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                  {results[sub.id] && <span className="text-green-600">{results[sub.id]}</span>}
                </div>
              </div>
            )
          })}

          {available.length > 0 ? (
            <select value="" onChange={(e) => link(e.target.value)}
              className="w-full h-8 px-2 text-sm text-gray-500 bg-white border border-dashed border-gray-300 rounded-md hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors">
              <option value="">{submissions.length ? 'Nog een vragenlijst koppelen…' : 'Vragenlijst koppelen…'}</option>
              {available.map(f => <option key={f.id} value={f.id}>{f.title}</option>)}
            </select>
          ) : forms.length === 0 ? (
            <p className="text-xs text-gray-400">Maak eerst een vragenlijst aan bij Formulieren.</p>
          ) : null}
        </div>
      )}
    </div>
  )
}
