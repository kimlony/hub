import { useCallback, useEffect, useMemo, useState } from 'react'
import Layout from '../components/Layout'
import { useAuthenticatedFetch } from '../hooks/useAuthenticatedFetch'

type ScheduleKind = 'COLLECT' | 'STATUS_SYNC'
type RunMode = 'FIXED_TIME' | 'INTERVAL'

type ChannelInfo = { mallKey: string; mallName: string; registered: boolean; useYn: string | null }
type ScheduleItem = {
  id: number
  scheduleName: string
  mallKeys: string[]
  statusTypes?: string[]
  scheduleMode?: RunMode
  intervalHours?: number | null
  dateRangeType: string
  runTime: string
  enabledYn: 'Y' | 'N'
  runningYn: 'Y' | 'N'
  lastRunAt: string | null
  nextRunAt: string | null
  lastErrorMessage: string | null
  createdAt: string | null
  updatedAt: string | null
}
type ScheduleRunLog = {
  id: number
  scheduleId: number | null
  scheduleName: string
  status: string
  mallKeys: string[]
  statusTypes?: string[]
  dateRangeType: string
  frDt: string
  toDt: string
  jobCount: number
  requestIds: string[]
  errorMessage: string | null
  startedAt: string | null
  finishedAt: string | null
  createdAt: string | null
}
type ScheduleListResponse = { schedules: ScheduleItem[]; runLogs: ScheduleRunLog[] }
type FormState = {
  scheduleName: string
  mallKeys: string[]
  statusTypes: string[]
  dateRangeType: string
  runMode: RunMode
  runTime: string
  intervalHours: string
  enabledYn: 'Y' | 'N'
}

const T = {
  pageTitle: '\uBC30\uCE58 \uC791\uC5C5',
  collectBatch: '\uC8FC\uBB38\uC218\uC9D1 \uBC30\uCE58',
  syncBatch: '\uC8FC\uBB38\uB3D9\uAE30\uD654 \uBC30\uCE58',
  batchHint: '\uBC30\uCE58\uB294 \uC9C1\uC811 \uC218\uC9D1/\uB3D9\uAE30\uD654\uB97C \uC218\uD589\uD558\uC9C0 \uC54A\uACE0 Job\uC744 \uC0DD\uC131\uD569\uB2C8\uB2E4.',
  register: '\uB4F1\uB85D',
  edit: '\uC218\uC815',
  new: '\uC2E0\uADDC',
  name: '\uC791\uC5C5\uBA85',
  runMode: '\uC2E4\uD589 \uBC29\uC2DD',
  fixedTime: '\uC815\uD574\uC9C4 \uC2DC\uAC04',
  interval: 'N\uC2DC\uAC04\uB9C8\uB2E4',
  runTime: '\uC2E4\uD589 \uC2DC\uAC04',
  intervalHours: '\uBC18\uBCF5 \uC8FC\uAE30',
  hours: '\uC2DC\uAC04\uB9C8\uB2E4',
  range: '\uC870\uD68C \uBC94\uC704',
  statusTypes: '\uB3D9\uAE30\uD654 \uC0C1\uD0DC \uC720\uD615',
  channel: '\uCC44\uB110',
  enabled: '\uC0AC\uC6A9 \uC5EC\uBD80',
  save: '\uC800\uC7A5',
  saving: '\uC800\uC7A5 \uC911...',
  saveEdit: '\uC218\uC815 \uC800\uC7A5',
  registered: '\uB4F1\uB85D\uB41C',
  execution: '\uC2E4\uD589',
  nextRun: '\uB2E4\uC74C \uC2E4\uD589',
  status: '\uC0C1\uD0DC',
  action: '\uC561\uC158',
  loading: '\uBD88\uB7EC\uC624\uB294 \uC911...',
  empty: '\uB4F1\uB85D\uB41C \uBC30\uCE58 \uC791\uC5C5\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.',
  running: '\uC2E4\uD589 \uC911',
  stop: '\uC911\uC9C0',
  start: '\uC2DC\uC791',
  delete: '\uC0AD\uC81C',
  deleteConfirm: '\uBC30\uCE58 \uC791\uC5C5\uC744 \uC0AD\uC81C\uD560\uAE4C\uC694?',
  recentHistory: '\uCD5C\uADFC \uC2E4\uD589 \uC774\uB825',
  period: '\uAE30\uAC04',
  time: '\uC2DC\uAC01',
  noHistory: '\uC544\uC9C1 \uC2E4\uD589 \uC774\uB825\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.',
  intervalHelp: '\uC800\uC7A5 \uC2DC\uC810\uBD80\uD130 \uC785\uB825\uD55C \uC2DC\uAC04 \uAC04\uACA9\uC73C\uB85C \uB2E4\uC74C \uC2E4\uD589 \uC2DC\uAC04\uC774 \uACC4\uC0B0\uB429\uB2C8\uB2E4.',
  noChannel: '\uD65C\uC131\uD654\uB41C \uCC44\uB110\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.',
}

const DATE_RANGE_LABELS: Record<string, string> = {
  YESTERDAY: '\uC5B4\uC81C',
  TODAY: '\uC624\uB298',
  LAST_3_DAYS: '\uCD5C\uADFC 3\uC77C',
  LAST_7_DAYS: '\uCD5C\uADFC 7\uC77C',
}
const STATUS_TYPE_LABELS: Record<string, string> = {
  PAID: '\uACB0\uC81C\uC644\uB8CC',
  ORDER_CONFIRMED: '\uC8FC\uBB38\uD655\uC778',
  PREPARING: '\uBC30\uC1A1\uC900\uBE44\uC911',
  SHIPPING: '\uBC30\uC1A1\uC911',
  DELIVERED: '\uBC30\uC1A1\uC644\uB8CC',
  CANCELED: '\uCDE8\uC18C\uC644\uB8CC',
}
const ENDPOINTS: Record<ScheduleKind, string> = { COLLECT: '/api/hub/schedules', STATUS_SYNC: '/api/hub/status-sync-schedules' }
const DEFAULT_COLLECT_FORM: FormState = { scheduleName: T.collectBatch, mallKeys: [], statusTypes: [], dateRangeType: 'YESTERDAY', runMode: 'FIXED_TIME', runTime: '02:00', intervalHours: '1', enabledYn: 'Y' }
const DEFAULT_STATUS_SYNC_FORM: FormState = { scheduleName: T.syncBatch, mallKeys: [], statusTypes: ['PAID', 'ORDER_CONFIRMED', 'PREPARING', 'SHIPPING', 'CANCELED'], dateRangeType: 'LAST_7_DAYS', runMode: 'FIXED_TIME', runTime: '03:00', intervalHours: '1', enabledYn: 'Y' }

function defaultForm(kind: ScheduleKind): FormState { return kind === 'COLLECT' ? DEFAULT_COLLECT_FORM : DEFAULT_STATUS_SYNC_FORM }
function formatText(value: string | null | undefined) { return value && value.trim() ? value : '-' }
function formatJobDate(value: string): string { return /^\d{8}$/.test(value) ? `${value.slice(4, 6)}/${value.slice(6, 8)}` : value || '-' }
function toErrorMessage(error: unknown, fallback: string) { return error instanceof Error ? error.message : fallback }

export default function SchedulePage() {
  const authenticatedFetch = useAuthenticatedFetch()
  const [kind, setKind] = useState<ScheduleKind>('COLLECT')
  const [channels, setChannels] = useState<ChannelInfo[]>([])
  const [schedules, setSchedules] = useState<ScheduleItem[]>([])
  const [runLogs, setRunLogs] = useState<ScheduleRunLog[]>([])
  const [form, setForm] = useState<FormState>(DEFAULT_COLLECT_FORM)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const activeChannels = useMemo(() => [...new Map(channels.filter((channel) => channel.registered && channel.useYn === 'Y').map((channel) => [channel.mallKey, channel])).values()], [channels])

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    setSchedules([])
    setRunLogs([])
    try {
      const [channelRes, scheduleRes] = await Promise.all([authenticatedFetch('/api/channels'), authenticatedFetch(ENDPOINTS[kind])])
      if (!channelRes.ok) throw new Error('\uCC44\uB110 \uC870\uD68C\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4.')
      if (!scheduleRes.ok) throw new Error('\uBC30\uCE58 \uC791\uC5C5 \uC870\uD68C\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4.')
      setChannels(await channelRes.json() as ChannelInfo[])
      const body = await scheduleRes.json() as ScheduleListResponse
      setSchedules(body.schedules ?? [])
      setRunLogs(body.runLogs ?? [])
    } catch (e) {
      setError(toErrorMessage(e, '\uB370\uC774\uD130 \uC870\uD68C \uC911 \uC624\uB958\uAC00 \uBC1C\uC0DD\uD588\uC2B5\uB2C8\uB2E4.'))
    } finally {
      setLoading(false)
    }
  }, [authenticatedFetch, kind])

  useEffect(() => { void fetchData() }, [fetchData])

  function changeKind(nextKind: ScheduleKind) {
    setKind(nextKind)
    setEditingId(null)
    setForm(defaultForm(nextKind))
    setSchedules([])
    setRunLogs([])
    setError(null)
  }
  function toggleMall(mallKey: string) { setForm((prev) => { const selected = new Set(prev.mallKeys); selected.has(mallKey) ? selected.delete(mallKey) : selected.add(mallKey); return { ...prev, mallKeys: [...selected] } }) }
  function toggleStatusType(statusType: string) { setForm((prev) => { const selected = new Set(prev.statusTypes); selected.has(statusType) ? selected.delete(statusType) : selected.add(statusType); return { ...prev, statusTypes: [...selected] } }) }
  function startEdit(schedule: ScheduleItem) {
    setEditingId(schedule.id)
    setForm({ scheduleName: schedule.scheduleName, mallKeys: schedule.mallKeys, statusTypes: schedule.statusTypes ?? defaultForm(kind).statusTypes, dateRangeType: schedule.dateRangeType, runMode: schedule.scheduleMode ?? 'FIXED_TIME', runTime: schedule.runTime, intervalHours: String(schedule.intervalHours ?? 1), enabledYn: schedule.enabledYn })
  }
  function resetForm() { setEditingId(null); setForm(defaultForm(kind)) }
  function buildRequestBody() {
    const base = { scheduleName: form.scheduleName, mallKeys: form.mallKeys, dateRangeType: form.dateRangeType, scheduleMode: form.runMode, intervalHours: form.runMode === 'INTERVAL' ? Number(form.intervalHours) : null, runTime: form.runTime, enabledYn: form.enabledYn }
    return kind === 'STATUS_SYNC' ? { ...base, statusTypes: form.statusTypes } : base
  }
  async function handleSubmit() {
    if (submitting) return
    if (form.mallKeys.length === 0) { setError('\uCD5C\uC18C 1\uAC1C \uC774\uC0C1\uC758 \uCC44\uB110\uC744 \uC120\uD0DD\uD574 \uC8FC\uC138\uC694.'); return }
    if (kind === 'STATUS_SYNC' && form.statusTypes.length === 0) { setError('\uC8FC\uBB38\uB3D9\uAE30\uD654 \uBC30\uCE58\uB294 \uCD5C\uC18C 1\uAC1C \uC774\uC0C1\uC758 \uC0C1\uD0DC \uC720\uD615\uC744 \uC120\uD0DD\uD574\uC57C \uD569\uB2C8\uB2E4.'); return }
    if (form.runMode === 'INTERVAL' && (!Number(form.intervalHours) || Number(form.intervalHours) < 1 || Number(form.intervalHours) > 24)) { setError('\uBC18\uBCF5 \uC8FC\uAE30\uB294 1\uC2DC\uAC04\uBD80\uD130 24\uC2DC\uAC04\uAE4C\uC9C0 \uC785\uB825\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4.'); return }
    setSubmitting(true)
    setError(null)
    try {
      const endpoint = ENDPOINTS[kind]
      const res = await authenticatedFetch(editingId ? `${endpoint}/${editingId}` : endpoint, { method: editingId ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(buildRequestBody()) })
      if (!res.ok) { const body = await res.json().catch(() => ({})); throw new Error(body.message ?? '\uBC30\uCE58 \uC791\uC5C5 \uC800\uC7A5\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4.') }
      resetForm()
      await fetchData()
    } catch (e) { setError(toErrorMessage(e, '\uBC30\uCE58 \uC791\uC5C5 \uC800\uC7A5 \uC911 \uC624\uB958\uAC00 \uBC1C\uC0DD\uD588\uC2B5\uB2C8\uB2E4.')) } finally { setSubmitting(false) }
  }
  async function toggleEnabled(schedule: ScheduleItem) { const enabledYn = schedule.enabledYn === 'Y' ? 'N' : 'Y'; await authenticatedFetch(`${ENDPOINTS[kind]}/${schedule.id}/enabled`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ enabledYn }) }); await fetchData() }
  async function deleteSchedule(id: number) { if (!window.confirm(T.deleteConfirm)) return; await authenticatedFetch(`${ENDPOINTS[kind]}/${id}`, { method: 'DELETE' }); if (editingId === id) resetForm(); await fetchData() }

  const currentTitle = kind === 'COLLECT' ? T.collectBatch : T.syncBatch
  const tableColSpan = kind === 'STATUS_SYNC' ? 7 : 6

  return (
    <Layout title={T.pageTitle}>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3"><div className="inline-flex rounded-2xl bg-slate-100 p-1"><button onClick={() => changeKind('COLLECT')} className={`px-4 py-2 text-[13px] font-extrabold rounded-xl ${kind === 'COLLECT' ? 'bg-white text-[#191F28] shadow-sm' : 'text-[#6B7684]'}`}>{T.collectBatch}</button><button onClick={() => changeKind('STATUS_SYNC')} className={`px-4 py-2 text-[13px] font-extrabold rounded-xl ${kind === 'STATUS_SYNC' ? 'bg-white text-[#191F28] shadow-sm' : 'text-[#6B7684]'}`}>{T.syncBatch}</button></div><p className="text-[12px] text-[#8B95A1]">{T.batchHint}</p></div>
      <div className="grid grid-cols-[380px_1fr] gap-6">
        <section className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5 h-fit"><div className="flex items-start justify-between gap-3"><div><h2 className="text-[16px] font-extrabold text-[#191F28]">{editingId ? `${currentTitle} ${T.edit}` : `${currentTitle} ${T.register}`}</h2><p className="mt-1 text-[12px] text-[#8B95A1]">{kind === 'COLLECT' ? '\uC120\uD0DD\uD55C \uCC44\uB110\uC758 \uC8FC\uBB38\uC218\uC9D1 Job\uC744 \uC815\uD574\uC9C4 \uC8FC\uAE30\uB85C \uC0DD\uC131\uD569\uB2C8\uB2E4.' : '\uC774\uBBF8 \uC218\uC9D1\uB41C \uC8FC\uBB38\uC758 \uC0C1\uD0DC \uB3D9\uAE30\uD654 Job\uC744 \uC815\uD574\uC9C4 \uC8FC\uAE30\uB85C \uC0DD\uC131\uD569\uB2C8\uB2E4.'}</p></div>{editingId && <button onClick={resetForm} className="px-3 py-1.5 text-[12px] font-bold rounded-xl bg-slate-100 text-[#4E5968] hover:bg-slate-200">{T.new}</button>}</div>
          <div className="mt-5 space-y-4"><div><label className="block mb-2 text-[12px] font-bold text-[#8B95A1]">{T.name}</label><input value={form.scheduleName} onChange={(e) => setForm((prev) => ({ ...prev, scheduleName: e.target.value }))} className="w-full px-3 py-2 text-[13px] border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#3182F6]/30" /></div>
            <div><label className="block mb-2 text-[12px] font-bold text-[#8B95A1]">{T.runMode}</label><div className="grid grid-cols-2 gap-2"><label className={`flex items-center gap-2 px-3 py-2 rounded-xl border cursor-pointer ${form.runMode === 'FIXED_TIME' ? 'border-[#3182F6] bg-blue-50' : 'border-slate-200'}`}><input type="radio" checked={form.runMode === 'FIXED_TIME'} onChange={() => setForm((prev) => ({ ...prev, runMode: 'FIXED_TIME' }))} className="accent-[#3182F6]" /><span className="text-[12px] font-bold text-[#4E5968]">{T.fixedTime}</span></label><label className={`flex items-center gap-2 px-3 py-2 rounded-xl border cursor-pointer ${form.runMode === 'INTERVAL' ? 'border-[#3182F6] bg-blue-50' : 'border-slate-200'}`}><input type="radio" checked={form.runMode === 'INTERVAL'} onChange={() => setForm((prev) => ({ ...prev, runMode: 'INTERVAL' }))} className="accent-[#3182F6]" /><span className="text-[12px] font-bold text-[#4E5968]">{T.interval}</span></label></div></div>
            <div className="grid grid-cols-2 gap-3">{form.runMode === 'FIXED_TIME' ? <div><label className="block mb-2 text-[12px] font-bold text-[#8B95A1]">{T.runTime}</label><input type="time" value={form.runTime} onChange={(e) => setForm((prev) => ({ ...prev, runTime: e.target.value }))} className="w-full px-3 py-2 text-[13px] border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#3182F6]/30" /></div> : <div><label className="block mb-2 text-[12px] font-bold text-[#8B95A1]">{T.intervalHours}</label><div className="flex items-center gap-2"><input type="number" min={1} max={24} value={form.intervalHours} onChange={(e) => setForm((prev) => ({ ...prev, intervalHours: e.target.value }))} className="w-full px-3 py-2 text-[13px] border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#3182F6]/30" /><span className="whitespace-nowrap text-[13px] font-bold text-[#4E5968]">{T.hours}</span></div></div>}<div><label className="block mb-2 text-[12px] font-bold text-[#8B95A1]">{T.range}</label><select value={form.dateRangeType} onChange={(e) => setForm((prev) => ({ ...prev, dateRangeType: e.target.value }))} className="w-full px-3 py-2 text-[13px] border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#3182F6]/30">{Object.entries(DATE_RANGE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>{form.runMode === 'INTERVAL' && <p className="col-span-2 text-[12px] text-[#8B95A1]">{T.intervalHelp}</p>}</div>
            {kind === 'STATUS_SYNC' && <div><label className="block mb-2 text-[12px] font-bold text-[#8B95A1]">{T.statusTypes}</label><div className="grid grid-cols-2 gap-2">{Object.entries(STATUS_TYPE_LABELS).map(([value, label]) => <label key={value} className="flex items-center gap-2 px-3 py-2 rounded-xl bg-[#F8FAFC] cursor-pointer"><input type="checkbox" checked={form.statusTypes.includes(value)} onChange={() => toggleStatusType(value)} className="w-4 h-4 accent-[#3182F6]" /><span className="text-[12px] font-bold text-[#4E5968]">{label}</span></label>)}</div></div>}
            <div><label className="block mb-2 text-[12px] font-bold text-[#8B95A1]">{T.channel}</label><div className="border border-slate-200 rounded-xl overflow-hidden">{activeChannels.length === 0 ? <div className="px-4 py-8 text-center text-[13px] text-[#8B95A1]">{T.noChannel}</div> : activeChannels.map((channel) => <label key={channel.mallKey} className="flex items-center gap-3 px-4 py-3 border-b border-slate-50 last:border-0 hover:bg-slate-50 cursor-pointer"><input type="checkbox" checked={form.mallKeys.includes(channel.mallKey)} onChange={() => toggleMall(channel.mallKey)} className="w-4 h-4 accent-[#3182F6]" /><span className="text-[13px] font-semibold text-[#4E5968]">{channel.mallName}</span><span className="ml-auto text-[11px] font-bold text-[#8B95A1]">{channel.mallKey}</span></label>)}</div></div>
            <label className="flex items-center justify-between gap-3 px-4 py-3 rounded-xl bg-[#F8FAFC] cursor-pointer"><span className="text-[13px] font-bold text-[#4E5968]">{T.enabled}</span><input type="checkbox" checked={form.enabledYn === 'Y'} onChange={(e) => setForm((prev) => ({ ...prev, enabledYn: e.target.checked ? 'Y' : 'N' }))} className="w-4 h-4 accent-[#3182F6]" /></label>{error && <p className="text-[12px] text-red-500">{error}</p>}<button onClick={handleSubmit} disabled={submitting || form.mallKeys.length === 0} className="w-full px-4 py-2.5 text-[13px] font-extrabold rounded-xl bg-[#3182F6] text-white hover:bg-blue-600 disabled:opacity-40 disabled:cursor-not-allowed">{submitting ? T.saving : editingId ? T.saveEdit : `${T.batchHint ? T.pageTitle : ''} ${T.register}`}</button></div></section>
        <section className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden"><div className="px-5 py-4 border-b border-slate-100"><h2 className="text-[16px] font-extrabold text-[#191F28]">{T.registered} {currentTitle}</h2></div><table className="w-full"><thead><tr className="bg-[#FAFAFA] border-b border-slate-100"><th className="px-5 py-3 text-left text-[11px] font-semibold text-[#8B95A1] uppercase tracking-wide">{T.name}</th><th className="px-5 py-3 text-left text-[11px] font-semibold text-[#8B95A1] uppercase tracking-wide">{T.execution}</th><th className="px-5 py-3 text-left text-[11px] font-semibold text-[#8B95A1] uppercase tracking-wide">{T.channel}</th>{kind === 'STATUS_SYNC' && <th className="px-5 py-3 text-left text-[11px] font-semibold text-[#8B95A1] uppercase tracking-wide">{T.statusTypes}</th>}<th className="px-5 py-3 text-left text-[11px] font-semibold text-[#8B95A1] uppercase tracking-wide">{T.nextRun}</th><th className="px-5 py-3 text-left text-[11px] font-semibold text-[#8B95A1] uppercase tracking-wide">{T.status}</th><th className="px-5 py-3 text-left text-[11px] font-semibold text-[#8B95A1] uppercase tracking-wide">{T.action}</th></tr></thead><tbody>{loading ? <tr><td colSpan={tableColSpan} className="px-5 py-12 text-center text-[13px] text-[#8B95A1]">{T.loading}</td></tr> : schedules.length === 0 ? <tr><td colSpan={tableColSpan} className="px-5 py-12 text-center text-[13px] text-[#8B95A1]">{T.empty}</td></tr> : schedules.map((schedule) => <tr key={schedule.id} className="border-t border-slate-50 hover:bg-slate-50"><td className="px-5 py-3"><p className="text-[13px] font-bold text-[#191F28]">{schedule.scheduleName}</p><p className="mt-1 text-[11px] text-[#8B95A1]">{DATE_RANGE_LABELS[schedule.dateRangeType] ?? schedule.dateRangeType}</p></td><td className="px-5 py-3 text-[13px] font-bold text-[#4E5968]">{schedule.scheduleMode === 'INTERVAL' ? `${schedule.intervalHours ?? '-'}${T.hours}` : schedule.runTime}</td><td className="px-5 py-3"><div className="flex flex-wrap gap-1.5">{schedule.mallKeys.map((mallKey) => <span key={mallKey} className="px-2 py-0.5 rounded-lg bg-slate-100 text-[11px] font-bold text-[#4E5968]">{mallKey}</span>)}</div></td>{kind === 'STATUS_SYNC' && <td className="px-5 py-3"><div className="flex flex-wrap gap-1.5">{(schedule.statusTypes ?? []).map((statusType) => <span key={statusType} className="px-2 py-0.5 rounded-lg bg-blue-50 text-[11px] font-bold text-[#3182F6]">{STATUS_TYPE_LABELS[statusType] ?? statusType}</span>)}</div></td>}<td className="px-5 py-3 text-[12px] text-[#8B95A1]">{formatText(schedule.nextRunAt)}</td><td className="px-5 py-3"><div className="flex flex-col gap-1"><span className={`w-fit px-2.5 py-0.5 rounded-lg text-[11px] font-bold ${schedule.enabledYn === 'Y' ? 'bg-[#E8FAF0] text-[#00A661]' : 'bg-slate-100 text-[#8B95A1]'}`}>{schedule.enabledYn === 'Y' ? 'ON' : 'OFF'}</span>{schedule.runningYn === 'Y' && <span className="text-[11px] font-bold text-[#3182F6]">{T.running}</span>}{schedule.lastErrorMessage && <span className="max-w-[180px] truncate text-[11px] text-red-500" title={schedule.lastErrorMessage}>{schedule.lastErrorMessage}</span>}</div></td><td className="px-5 py-3"><div className="flex items-center gap-2"><button onClick={() => startEdit(schedule)} className="px-3 py-1.5 text-[12px] font-bold rounded-xl bg-slate-100 text-[#4E5968] hover:bg-slate-200">{T.edit}</button><button onClick={() => void toggleEnabled(schedule)} className="px-3 py-1.5 text-[12px] font-bold rounded-xl bg-blue-50 text-[#3182F6] hover:bg-blue-100">{schedule.enabledYn === 'Y' ? T.stop : T.start}</button><button onClick={() => void deleteSchedule(schedule.id)} className="px-3 py-1.5 text-[12px] font-bold rounded-xl bg-red-50 text-red-600 hover:bg-red-100">{T.delete}</button></div></td></tr>)}</tbody></table></section>
      </div>
      <section className="mt-6 bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden"><div className="px-5 py-4 border-b border-slate-100"><h2 className="text-[16px] font-extrabold text-[#191F28]">{currentTitle} {T.recentHistory}</h2></div><table className="w-full"><thead><tr className="bg-[#FAFAFA] border-b border-slate-100"><th className="px-5 py-3 text-left text-[11px] font-semibold text-[#8B95A1] uppercase tracking-wide">{T.name}</th><th className="px-5 py-3 text-left text-[11px] font-semibold text-[#8B95A1] uppercase tracking-wide">{T.status}</th><th className="px-5 py-3 text-left text-[11px] font-semibold text-[#8B95A1] uppercase tracking-wide">{T.channel}</th><th className="px-5 py-3 text-left text-[11px] font-semibold text-[#8B95A1] uppercase tracking-wide">{T.period}</th><th className="px-5 py-3 text-left text-[11px] font-semibold text-[#8B95A1] uppercase tracking-wide">Job</th><th className="px-5 py-3 text-left text-[11px] font-semibold text-[#8B95A1] uppercase tracking-wide">{T.time}</th></tr></thead><tbody>{runLogs.length === 0 ? <tr><td colSpan={6} className="px-5 py-10 text-center text-[13px] text-[#8B95A1]">{T.noHistory}</td></tr> : runLogs.map((log) => <tr key={log.id} className="border-t border-slate-50 hover:bg-slate-50"><td className="px-5 py-3"><p className="text-[13px] font-bold text-[#191F28]">{log.scheduleName}</p>{log.errorMessage && <p className="mt-1 max-w-[260px] truncate text-[11px] text-red-500" title={log.errorMessage}>{log.errorMessage}</p>}</td><td className="px-5 py-3"><span className={`px-2.5 py-0.5 rounded-lg text-[11px] font-bold ${log.status === 'SUCCESS' ? 'bg-[#E8FAF0] text-[#00A661]' : log.status === 'FAILED' ? 'bg-red-50 text-red-600' : 'bg-blue-50 text-[#3182F6]'}`}>{log.status}</span></td><td className="px-5 py-3"><div className="flex flex-wrap gap-1.5">{log.mallKeys.map((mallKey) => <span key={mallKey} className="px-2 py-0.5 rounded-lg bg-slate-100 text-[11px] font-bold text-[#4E5968]">{mallKey}</span>)}</div></td><td className="px-5 py-3 text-[12px] text-[#4E5968]">{formatJobDate(log.frDt)} ~ {formatJobDate(log.toDt)}</td><td className="px-5 py-3 text-[13px] font-bold text-[#4E5968]">{log.jobCount}</td><td className="px-5 py-3 text-[12px] text-[#8B95A1]">{formatText(log.finishedAt ?? log.startedAt)}</td></tr>)}</tbody></table></section>
    </Layout>
  )
}