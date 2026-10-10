import { Fragment, useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import LeadScanDialog from '../../components/LeadScanDialog'
import type { Lead, LeadPriority, LeadStatus } from '../../types'
import type { LeadSortMode } from '../../lib/leads'
import {
  Search,
  Phone,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ArrowDownWideNarrow,
  CalendarClock,
  RotateCcw,
  UserPlus,
  BadgeCheck,
  Plus,
} from 'lucide-react'
import {
  PRIORITIES,
  PRIORITY_ORDER,
  STATUSES,
  STATUS_ORDER,
  city,
  formatDate,
  formatScanned,
  SORT_MODES,
  makeLeadComparator,
  hostname,
  telHref,
  todayISO,
} from '../../lib/leads'

const PAGE_SIZES = [25, 50, 100]
const PAGE_SIZE_STORAGE_KEY = 'leads-page-size'
const SORT_STORAGE_KEY = 'leads-sort-mode'

const readPageSize = () => {
  try {
    const stored = Number(localStorage.getItem(PAGE_SIZE_STORAGE_KEY))
    return PAGE_SIZES.includes(stored) ? stored : PAGE_SIZES[0]
  } catch {
    return PAGE_SIZES[0]
  }
}

const readSortMode = (): LeadSortMode => {
  try {
    const stored = localStorage.getItem(SORT_STORAGE_KEY)
    return stored === 'kans' || stored === 'opvolging' ? stored : 'opvolging'
  } catch {
    return 'opvolging'
  }
}

export default function Leads() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const [leads, setLeads] = useState<Lead[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [priorityFilter, setPriorityFilter] = useState<'' | LeadPriority>('')
  const [statusFilter, setStatusFilter] = useState<'' | LeadStatus>('')
  const [typeFilter, setTypeFilter] = useState('')
  const [regionFilter, setRegionFilter] = useState('')
  const [onlyFollowUp, setOnlyFollowUp] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(readPageSize)
  const [sortMode, setSortMode] = useState<LeadSortMode>(readSortMode)
  const [scanOpen, setScanOpen] = useState(false)
  const [scanStarted, setScanStarted] = useState<string | null>(null)

  const fetchLeads = async () => {
    const { data } = await supabase.from('leads').select('*')
    setLeads((data || []) as Lead[])
    setLoading(false)
  }

  useEffect(() => { fetchLeads() }, [])

  // Het dashboard linkt hierheen met een filter in de URL (?opvolgen=1 of
  // ?status=interessant). Daarna halen we hem weg, zodat een verversing niet
  // een filter terugzet dat je net had weggeklikt.
  useEffect(() => {
    const status = searchParams.get('status')
    const opvolgen = searchParams.get('opvolgen')
    if (!status && !opvolgen) return

    if (opvolgen === '1') setOnlyFollowUp(true)
    if (status && status in STATUSES) setStatusFilter(status as LeadStatus)
    setPage(1)
    setSearchParams({}, { replace: true })
  }, [searchParams, setSearchParams])

  /** Werkt een lead bij in de database én meteen in beeld. */
  const saveLead = async (id: string, patch: Partial<Lead>) => {
    setLeads((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)))
    setSavingId(id)
    const { error } = await supabase
      .from('leads')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('id', id)
    setSavingId(null)
    if (error) {
      // Mislukt: haal de echte stand weer op zodat het scherm niet liegt.
      alert(`Opslaan mislukt: ${error.message}`)
      fetchLeads()
    }
  }

  /**
   * Opent het klantformulier met wat we al van de lead weten. De contactpersoon
   * en het e-mailadres kent de scanner niet, die vul je daar zelf aan.
   */
  const addAsClient = (lead: Lead) => {
    navigate('/admin/klanten', {
      state: {
        leadPrefill: {
          leadId: lead.id,
          company: lead.name,
          phone: lead.phone ?? '',
          domainName: lead.name,
          // Alleen een echte eigen site is een domein; een Facebook-pagina
          // of gids-vermelding niet.
          domainUrl: lead.website_kind === 'eigen' ? (lead.website ?? '') : '',
        },
      },
    })
  }

  const types = useMemo(
    () => [...new Set(leads.map((l) => l.lead_type).filter(Boolean))].sort() as string[],
    [leads],
  )
  const regions = useMemo(
    () => [...new Set(leads.map((l) => l.region).filter(Boolean))].sort() as string[],
    [leads],
  )

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    const today = todayISO()
    return leads
      .filter((l) => {
        if (priorityFilter && l.priority !== priorityFilter) return false
        if (statusFilter && l.status !== statusFilter) return false
        if (typeFilter && l.lead_type !== typeFilter) return false
        if (regionFilter && l.region !== regionFilter) return false
        if (onlyFollowUp && !(l.follow_up_at && l.follow_up_at <= today)) return false
        if (!q) return true
        return [l.name, l.address, l.website, l.search_query, l.note]
          .filter(Boolean)
          .some((v) => (v as string).toLowerCase().includes(q))
      })
      .sort(makeLeadComparator(sortMode))
  }, [leads, search, priorityFilter, statusFilter, typeFilter, regionFilter, onlyFollowUp, sortMode])

  const stats = useMemo(() => {
    const today = todayISO()
    const count = (p: LeadPriority) => leads.filter((l) => l.priority === p).length
    return {
      totaal: leads.length,
      kansen: count('geen_site') + count('social') + count('hoog'),
      onbenaderd: leads.filter((l) => l.status === 'nieuw').length,
      opvolgen: leads.filter((l) => l.follow_up_at && l.follow_up_at <= today).length,
    }
  }, [leads])

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const currentPage = Math.min(page, totalPages)
  const pageRows = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize)

  const resetFilters = () => {
    setSearch(''); setPriorityFilter(''); setStatusFilter('')
    setTypeFilter(''); setRegionFilter(''); setOnlyFollowUp(false); setPage(1)
  }

  const filtersActive =
    !!search || !!priorityFilter || !!statusFilter || !!typeFilter || !!regionFilter || onlyFollowUp

  const changeSortMode = (mode: LeadSortMode) => {
    setSortMode(mode)
    setPage(1)
    try { localStorage.setItem(SORT_STORAGE_KEY, mode) } catch { /* privémodus */ }
  }

  const changePageSize = (size: number) => {
    setPageSize(size)
    setPage(1)
    try { localStorage.setItem(PAGE_SIZE_STORAGE_KEY, String(size)) } catch { /* privémodus */ }
  }

  return (
    <div>
      {scanOpen && (
        <LeadScanDialog
          onClose={() => setScanOpen(false)}
          onStarted={(url) => { setScanOpen(false); setScanStarted(url) }}
        />
      )}

      {scanStarted && (
        <div className="flex items-center justify-between gap-4 mb-5 px-4 py-3 bg-green-50 border border-green-100 rounded-xl">
          <p className="text-sm text-green-900">
            Scan gestart. De resultaten verschijnen hier vanzelf zodra hij klaar is —
            ververs deze pagina over een minuut of twee.
          </p>
          <div className="flex items-center gap-3 flex-shrink-0">
            <a href={scanStarted} target="_blank" rel="noopener noreferrer"
               className="text-sm text-green-800 underline hover:no-underline">
              Volg de scan
            </a>
            <button onClick={() => { setScanStarted(null); fetchLeads() }}
                    className="text-sm font-medium text-green-800 hover:text-green-900">
              Ververs
            </button>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Leads</h1>
          <p className="text-gray-500 mt-1">{SORT_MODES[sortMode].hint}.</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setScanOpen(true)}
            className="flex items-center gap-2 bg-primary hover:bg-primary-600 text-white px-4 py-2.5 rounded-lg font-medium transition-colors"
          >
            <Plus className="w-4 h-4" />
            Nieuwe scan
          </button>
          <ArrowDownWideNarrow className="w-4 h-4 text-gray-400" />
          <select
            value={sortMode}
            onChange={(e) => changeSortMode(e.target.value as LeadSortMode)}
            className="px-3 py-2 bg-white border border-gray-200 rounded-xl text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
            title="Volgorde van de lijst"
          >
            {(Object.keys(SORT_MODES) as LeadSortMode[]).map((m) => (
              <option key={m} value={m}>{SORT_MODES[m].label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Stats */}
      {!loading && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-5 py-4">
            <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Gescand</p>
            <p className="text-xl font-bold text-gray-900 mt-1">{stats.totaal}</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-5 py-4">
            <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Kansrijk</p>
            <p className="text-xl font-bold text-gray-900 mt-1">{stats.kansen}</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-5 py-4">
            <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Nog niet benaderd</p>
            <p className="text-xl font-bold text-gray-900 mt-1">{stats.onbenaderd}</p>
          </div>
          <button
            onClick={() => { setOnlyFollowUp(!onlyFollowUp); setPage(1) }}
            className={`text-left bg-white rounded-xl border shadow-sm px-5 py-4 transition-colors ${
              onlyFollowUp ? 'border-primary ring-2 ring-primary/20' : 'border-gray-100 hover:border-gray-200'
            }`}
          >
            <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Opvolgen</p>
            <p className="text-xl font-bold text-gray-900 mt-1">{stats.opvolgen}</p>
          </button>
        </div>
      )}

      {/* Filters */}
      {!loading && leads.length > 0 && (
        <div className="flex flex-col lg:flex-row gap-3 mb-5">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1) }}
              className="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary text-sm transition-all"
              placeholder="Zoek op naam, plaats, website of notitie..."
            />
          </div>
          <select
            value={priorityFilter}
            onChange={(e) => { setPriorityFilter(e.target.value as LeadPriority | ''); setPage(1) }}
            className="px-4 py-2.5 bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary text-sm transition-all"
          >
            <option value="">Alle prioriteiten</option>
            {PRIORITY_ORDER.map((p) => (
              <option key={p} value={p}>{PRIORITIES[p].label}</option>
            ))}
          </select>
          <select
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value as LeadStatus | ''); setPage(1) }}
            className="px-4 py-2.5 bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary text-sm transition-all"
          >
            <option value="">Alle statussen</option>
            {STATUS_ORDER.map((s) => (
              <option key={s} value={s}>{STATUSES[s].label}</option>
            ))}
          </select>
          {types.length > 1 && (
            <select
              value={typeFilter}
              onChange={(e) => { setTypeFilter(e.target.value); setPage(1) }}
              className="px-4 py-2.5 bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary text-sm transition-all"
            >
              <option value="">Alle types</option>
              {types.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          )}
          {regions.length > 1 && (
            <select
              value={regionFilter}
              onChange={(e) => { setRegionFilter(e.target.value); setPage(1) }}
              className="px-4 py-2.5 bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary text-sm transition-all"
            >
              <option value="">Alle regio's</option>
              {regions.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          )}
          {filtersActive && (
            <button
              onClick={resetFilters}
              className="flex items-center gap-2 px-4 py-2.5 text-sm text-gray-600 hover:text-gray-900 border border-gray-200 rounded-xl bg-white hover:bg-gray-50 transition-colors"
            >
              <RotateCcw className="w-4 h-4" />
              Wis filters
            </button>
          )}
        </div>
      )}

      {/* Tabel */}
      {loading ? (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-12 text-center text-gray-500">
          Leads laden...
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-12 text-center">
          <p className="text-gray-900 font-medium">Geen leads gevonden</p>
          <p className="text-gray-500 text-sm mt-1">
            {leads.length === 0
              ? 'Draai een scan op GitHub; de resultaten verschijnen hier vanzelf.'
              : 'Pas je filters aan om meer resultaten te zien.'}
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-left">
                  <th className="w-8"></th>
                  <th className="px-3 py-3 font-semibold text-gray-600">Bedrijf</th>
                  <th className="px-3 py-3 font-semibold text-gray-600">Kans</th>
                  <th className="px-3 py-3 font-semibold text-gray-600">Contact</th>
                  <th className="px-3 py-3 font-semibold text-gray-600">Status</th>
                  <th className="px-3 py-3 font-semibold text-gray-600">Opvolgen</th>
                  <th className="w-20"></th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((lead) => {
                  const prio = PRIORITIES[lead.priority ?? 'ok']
                  const expanded = expandedId === lead.id
                  const overdue = !!lead.follow_up_at && lead.follow_up_at <= todayISO()
                  return (
                    <Fragment key={lead.id}>
                      <tr
                        className={`border-b border-gray-50 hover:bg-gray-50/60 transition-colors ${
                          expanded ? 'bg-gray-50/60' : ''
                        }`}
                      >
                        <td className="pl-4">
                          <span className={`block w-2.5 h-2.5 rounded-full ${prio.dot}`} title={prio.label} />
                        </td>
                        <td className="px-3 py-3">
                          <p className="font-medium text-gray-900">{lead.name}</p>
                          <p className="text-xs text-gray-500">
                            {city(lead.address)}
                            {lead.lead_type && <span className="text-gray-400"> · {lead.lead_type}</span>}
                            {lead.client_id && (
                              <span className="ml-2 px-1.5 py-0.5 rounded bg-green-50 text-green-700 font-medium">
                                Klant
                              </span>
                            )}
                          </p>
                        </td>
                        <td className="px-3 py-3">
                          <span className={`inline-block px-2 py-0.5 rounded-md text-xs font-medium ${prio.badge}`}>
                            {prio.short}
                          </span>
                          {lead.priority !== 'geen_site' && lead.priority !== 'social' && lead.score !== null && (
                            <span className="text-xs text-gray-400 ml-2">{lead.score}/100</span>
                          )}
                        </td>
                        <td className="px-3 py-3">
                          <div className="flex items-center gap-3">
                            {lead.phone && (
                              <a
                                href={telHref(lead.phone)}
                                className="flex items-center gap-1.5 text-gray-600 hover:text-primary transition-colors"
                                title={lead.phone}
                              >
                                <Phone className="w-3.5 h-3.5" />
                                <span className="text-xs whitespace-nowrap">{lead.phone}</span>
                              </a>
                            )}
                            {lead.website && (
                              <a
                                href={lead.website}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-1 text-gray-500 hover:text-primary transition-colors"
                                title={lead.website}
                              >
                                <ExternalLink className="w-3.5 h-3.5" />
                                <span className="text-xs">{hostname(lead.website)}</span>
                              </a>
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-3">
                          <select
                            value={lead.status}
                            onChange={(e) => saveLead(lead.id, { status: e.target.value as LeadStatus })}
                            className={`px-2 py-1 rounded-md text-xs font-medium border-0 cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary/30 ${STATUSES[lead.status].badge}`}
                          >
                            {STATUS_ORDER.map((s) => (
                              <option key={s} value={s}>{STATUSES[s].label}</option>
                            ))}
                          </select>
                        </td>
                        <td className="px-3 py-3">
                          <input
                            type="date"
                            value={lead.follow_up_at ?? ''}
                            onChange={(e) => saveLead(lead.id, { follow_up_at: e.target.value || null })}
                            className={`px-2 py-1 text-xs border rounded-md focus:outline-none focus:ring-2 focus:ring-primary/30 ${
                              overdue ? 'border-amber-300 bg-amber-50 text-amber-800' : 'border-gray-200 text-gray-600'
                            }`}
                          />
                        </td>
                        <td className="pr-4">
                          <div className="flex items-center justify-end">
                            {lead.client_id ? (
                              <button
                                onClick={() => navigate('/admin/klanten')}
                                className="p-1.5 text-green-600 hover:text-green-700 transition-colors"
                                title="Is al klant — open de klantenpagina"
                              >
                                <BadgeCheck className="w-4 h-4" />
                              </button>
                            ) : (
                              <button
                                onClick={() => addAsClient(lead)}
                                className="p-1.5 text-gray-400 hover:text-primary transition-colors"
                                title="Voeg toe als klant"
                              >
                                <UserPlus className="w-4 h-4" />
                              </button>
                            )}
                            <button
                              onClick={() => setExpandedId(expanded ? null : lead.id)}
                              className="p-1.5 text-gray-400 hover:text-gray-700 transition-colors"
                              title={expanded ? 'Inklappen' : 'Details en notitie'}
                            >
                              <ChevronDown className={`w-4 h-4 transition-transform ${expanded ? 'rotate-180' : ''}`} />
                            </button>
                          </div>
                        </td>
                      </tr>

                      {expanded && (
                        <tr className="border-b border-gray-100 bg-gray-50/60">
                          <td></td>
                          <td colSpan={6} className="px-3 pb-5 pt-1">
                            <div className="grid md:grid-cols-2 gap-6">
                              <div>
                                <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2">
                                  Gevonden problemen
                                </p>
                                {lead.issues?.length ? (
                                  <ul className="space-y-1">
                                    {lead.issues.map((issue, i) => (
                                      <li key={i} className="text-xs text-gray-600 flex gap-2">
                                        <span className="text-gray-300">•</span>
                                        <span>{issue}</span>
                                      </li>
                                    ))}
                                  </ul>
                                ) : (
                                  <p className="text-xs text-gray-400">
                                    Nog niet ingevuld — verschijnt na de eerstvolgende scan.
                                  </p>
                                )}

                                <div className="flex flex-wrap gap-x-5 gap-y-1 mt-4 text-xs text-gray-500">
                                  {lead.cms && <span>CMS: <span className="text-gray-700">{lead.cms}</span></span>}
                                  {lead.load_time_seconds !== null && (
                                    <span>Laadtijd: <span className="text-gray-700">{lead.load_time_seconds}s</span></span>
                                  )}
                                  {lead.google_rating !== null && (
                                    <span>Google: <span className="text-gray-700">{lead.google_rating}</span></span>
                                  )}
                                  {lead.search_query && (
                                    <span>Gevonden via: <span className="text-gray-700">{lead.search_query}</span></span>
                                  )}
                                  <span>Gescand: <span className="text-gray-700">{formatScanned(lead.scanned_at)}</span></span>
                                </div>
                                {lead.address && <p className="text-xs text-gray-500 mt-2">{lead.address}</p>}
                              </div>

                              <div>
                                <div className="flex items-center justify-between mb-2">
                                  <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
                                    Notitie
                                  </p>
                                  {savingId === lead.id && (
                                    <span className="text-[11px] text-gray-400">opslaan...</span>
                                  )}
                                </div>
                                <textarea
                                  defaultValue={lead.note ?? ''}
                                  onBlur={(e) => {
                                    if (e.target.value !== (lead.note ?? '')) {
                                      saveLead(lead.id, { note: e.target.value || null })
                                    }
                                  }}
                                  rows={5}
                                  placeholder="Wat heb je gedaan, wat is de insteek, wie is de contactpersoon..."
                                  className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary resize-y"
                                />
                                <div className="flex items-center gap-2 mt-3">
                                  <CalendarClock className="w-3.5 h-3.5 text-gray-400" />
                                  <label className="text-xs text-gray-500">Laatst contact</label>
                                  <input
                                    type="date"
                                    value={lead.last_contact_at ?? ''}
                                    onChange={(e) => saveLead(lead.id, { last_contact_at: e.target.value || null })}
                                    className="px-2 py-1 text-xs border border-gray-200 rounded-md text-gray-600 focus:outline-none focus:ring-2 focus:ring-primary/30"
                                  />
                                  {lead.last_contact_at && (
                                    <span className="text-xs text-gray-400">{formatDate(lead.last_contact_at)}</span>
                                  )}
                                </div>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Paginering */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-3 border-t border-gray-100">
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <span>{filtered.length} van {leads.length} leads</span>
              <select
                value={pageSize}
                onChange={(e) => changePageSize(Number(e.target.value))}
                className="px-2 py-1 border border-gray-200 rounded-md text-xs focus:outline-none focus:ring-2 focus:ring-primary/30"
              >
                {PAGE_SIZES.map((s) => <option key={s} value={s}>{s} per pagina</option>)}
              </select>
            </div>
            {totalPages > 1 && (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage(currentPage - 1)}
                  disabled={currentPage === 1}
                  className="p-1.5 border border-gray-200 rounded-lg text-gray-600 disabled:opacity-40 hover:bg-gray-50 transition-colors"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="text-xs text-gray-500">{currentPage} / {totalPages}</span>
                <button
                  onClick={() => setPage(currentPage + 1)}
                  disabled={currentPage === totalPages}
                  className="p-1.5 border border-gray-200 rounded-lg text-gray-600 disabled:opacity-40 hover:bg-gray-50 transition-colors"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
