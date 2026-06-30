import { useCallback, useEffect, useMemo, useState } from 'react'
import Layout from '../components/Layout'
import { useAuthenticatedFetch } from '../hooks/useAuthenticatedFetch'

type ChannelInfo = {
  mallKey: string
  mallName: string
  registered: boolean
  useYn: string | null
}

type CollectSchedule = {
  id: number
  scheduleName: string
  mallKeys: string[]
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

type CollectScheduleRunLog = {
  id: number
  scheduleId: number | null
  scheduleName: string
  status: string
  mallKeys: string[]
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

type ScheduleListResponse = {
  schedules: CollectSchedule[]
  runLogs: CollectScheduleRunLog[]
}

type FormState = {
  scheduleName: string
  mallKeys: string[]
  dateRangeType: string
  runTime: string
  enabledYn: 'Y' | 'N'
}

const DATE_RANGE_LABELS: Record<string, string> = {
  YESTERDAY: '어제',
  TODAY: '오늘',
  LAST_3_DAYS: '최근 3일',
  LAST_7_DAYS: '최근 7일',
}

const DEFAULT_FORM: FormState = {
  scheduleName: '매일 주문수집',
  mallKeys: [],
  dateRangeType: 'YESTERDAY',
  runTime: '02:00',
  enabledYn: 'Y',
}

function formatText(value: string | null | undefined) {
  return value && value.trim() ? value : '-'
}

export default function SchedulePage() {
  const authenticatedFetch = useAuthenticatedFetch()
  const [channels, setChannels] = useState<ChannelInfo[]>([])
  const [schedules, setSchedules] = useState<CollectSchedule[]>([])
  const [runLogs, setRunLogs] = useState<CollectScheduleRunLog[]>([])
  const [form, setForm] = useState<FormState>(DEFAULT_FORM)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const activeChannels = useMemo(
    () => [...new Map(
      channels
        .filter((channel) => channel.registered && channel.useYn === 'Y')
        .map((channel) => [channel.mallKey, channel]),
    ).values()],
    [channels],
  )

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [channelRes, scheduleRes] = await Promise.all([
        authenticatedFetch('/api/channels'),
        authenticatedFetch('/api/hub/schedules'),
      ])
      if (!channelRes.ok) throw new Error('채널 조회에 실패했습니다.')
      if (!scheduleRes.ok) throw new Error('배치 작업 조회에 실패했습니다.')
      setChannels(await channelRes.json() as ChannelInfo[])
      const body = await scheduleRes.json() as ScheduleListResponse
      setSchedules(body.schedules)
      setRunLogs(body.runLogs ?? [])
    } catch (e) {
      setError(e instanceof Error ? e.message : '데이터 조회 중 오류가 발생했습니다.')
    } finally {
      setLoading(false)
    }
  }, [authenticatedFetch])

  useEffect(() => {
    void fetchData()
  }, [fetchData])

  function toggleMall(mallKey: string) {
    setForm((prev) => {
      const selected = new Set(prev.mallKeys)
      selected.has(mallKey) ? selected.delete(mallKey) : selected.add(mallKey)
      return { ...prev, mallKeys: [...selected] }
    })
  }

  function startEdit(schedule: CollectSchedule) {
    setEditingId(schedule.id)
    setForm({
      scheduleName: schedule.scheduleName,
      mallKeys: schedule.mallKeys,
      dateRangeType: schedule.dateRangeType,
      runTime: schedule.runTime,
      enabledYn: schedule.enabledYn,
    })
  }

  function resetForm() {
    setEditingId(null)
    setForm(DEFAULT_FORM)
  }

  async function handleSubmit() {
    if (form.mallKeys.length === 0 || submitting) return
    setSubmitting(true)
    setError(null)
    try {
      const res = await authenticatedFetch(
        editingId ? `/api/hub/schedules/${editingId}` : '/api/hub/schedules',
        {
          method: editingId ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(form),
        },
      )
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.message ?? '배치 작업 저장에 실패했습니다.')
      }
      resetForm()
      await fetchData()
    } catch (e) {
      setError(e instanceof Error ? e.message : '배치 작업 저장 중 오류가 발생했습니다.')
    } finally {
      setSubmitting(false)
    }
  }

  async function toggleEnabled(schedule: CollectSchedule) {
    const enabledYn = schedule.enabledYn === 'Y' ? 'N' : 'Y'
    await authenticatedFetch(`/api/hub/schedules/${schedule.id}/enabled`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabledYn }),
    })
    await fetchData()
  }

  async function deleteSchedule(id: number) {
    if (!window.confirm('배치 작업을 삭제할까요?')) return
    await authenticatedFetch(`/api/hub/schedules/${id}`, { method: 'DELETE' })
    if (editingId === id) resetForm()
    await fetchData()
  }

  return (
    <Layout title="배치 작업">
      <div className="grid grid-cols-[360px_1fr] gap-6">
        <section className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5 h-fit">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-[16px] font-extrabold text-[#191F28]">
                {editingId ? '배치 수정' : '새 배치 등록'}
              </h2>
              <p className="mt-1 text-[12px] text-[#8B95A1]">매일 지정한 시간에 수집 job을 생성합니다.</p>
            </div>
            {editingId && (
              <button
                onClick={resetForm}
                className="px-3 py-1.5 text-[12px] font-bold rounded-xl bg-slate-100 text-[#4E5968] hover:bg-slate-200"
              >
                신규
              </button>
            )}
          </div>

          <div className="mt-5 space-y-4">
            <div>
              <label className="block mb-2 text-[12px] font-bold text-[#8B95A1]">작업명</label>
              <input
                value={form.scheduleName}
                onChange={(e) => setForm((prev) => ({ ...prev, scheduleName: e.target.value }))}
                className="w-full px-3 py-2 text-[13px] border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#3182F6]/30"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block mb-2 text-[12px] font-bold text-[#8B95A1]">실행 시간</label>
                <input
                  type="time"
                  value={form.runTime}
                  onChange={(e) => setForm((prev) => ({ ...prev, runTime: e.target.value }))}
                  className="w-full px-3 py-2 text-[13px] border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#3182F6]/30"
                />
              </div>
              <div>
                <label className="block mb-2 text-[12px] font-bold text-[#8B95A1]">수집 범위</label>
                <select
                  value={form.dateRangeType}
                  onChange={(e) => setForm((prev) => ({ ...prev, dateRangeType: e.target.value }))}
                  className="w-full px-3 py-2 text-[13px] border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#3182F6]/30"
                >
                  {Object.entries(DATE_RANGE_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block mb-2 text-[12px] font-bold text-[#8B95A1]">채널</label>
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                {activeChannels.length === 0 ? (
                  <div className="px-4 py-8 text-center text-[13px] text-[#8B95A1]">
                    활성화된 채널이 없습니다.
                  </div>
                ) : (
                  activeChannels.map((channel) => (
                    <label key={channel.mallKey} className="flex items-center gap-3 px-4 py-3 border-b border-slate-50 last:border-0 hover:bg-slate-50 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={form.mallKeys.includes(channel.mallKey)}
                        onChange={() => toggleMall(channel.mallKey)}
                        className="w-4 h-4 accent-[#3182F6]"
                      />
                      <span className="text-[13px] font-semibold text-[#4E5968]">{channel.mallName}</span>
                      <span className="ml-auto text-[11px] font-bold text-[#8B95A1]">{channel.mallKey}</span>
                    </label>
                  ))
                )}
              </div>
            </div>

            <label className="flex items-center justify-between gap-3 px-4 py-3 rounded-xl bg-[#F8FAFC] cursor-pointer">
              <span className="text-[13px] font-bold text-[#4E5968]">사용 여부</span>
              <input
                type="checkbox"
                checked={form.enabledYn === 'Y'}
                onChange={(e) => setForm((prev) => ({ ...prev, enabledYn: e.target.checked ? 'Y' : 'N' }))}
                className="w-4 h-4 accent-[#3182F6]"
              />
            </label>

            {error && <p className="text-[12px] text-red-500">{error}</p>}

            <button
              onClick={handleSubmit}
              disabled={submitting || form.mallKeys.length === 0}
              className="w-full px-4 py-2.5 text-[13px] font-extrabold rounded-xl bg-[#3182F6] text-white hover:bg-blue-600 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {submitting ? '저장 중...' : editingId ? '수정 저장' : '배치 등록'}
            </button>
          </div>
        </section>

        <section className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100">
            <h2 className="text-[16px] font-extrabold text-[#191F28]">등록된 배치</h2>
          </div>
          <table className="w-full">
            <thead>
              <tr className="bg-[#FAFAFA] border-b border-slate-100">
                <th className="px-5 py-3 text-left text-[11px] font-semibold text-[#8B95A1] uppercase tracking-wide">작업명</th>
                <th className="px-5 py-3 text-left text-[11px] font-semibold text-[#8B95A1] uppercase tracking-wide">시간</th>
                <th className="px-5 py-3 text-left text-[11px] font-semibold text-[#8B95A1] uppercase tracking-wide">채널</th>
                <th className="px-5 py-3 text-left text-[11px] font-semibold text-[#8B95A1] uppercase tracking-wide">다음 실행</th>
                <th className="px-5 py-3 text-left text-[11px] font-semibold text-[#8B95A1] uppercase tracking-wide">상태</th>
                <th className="px-5 py-3 text-left text-[11px] font-semibold text-[#8B95A1] uppercase tracking-wide">액션</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-5 py-12 text-center text-[13px] text-[#8B95A1]">
                    불러오는 중...
                  </td>
                </tr>
              ) : schedules.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-12 text-center text-[13px] text-[#8B95A1]">
                    등록된 배치 작업이 없습니다.
                  </td>
                </tr>
              ) : (
                schedules.map((schedule) => (
                  <tr key={schedule.id} className="border-t border-slate-50 hover:bg-slate-50">
                    <td className="px-5 py-3">
                      <p className="text-[13px] font-bold text-[#191F28]">{schedule.scheduleName}</p>
                      <p className="mt-1 text-[11px] text-[#8B95A1]">
                        {DATE_RANGE_LABELS[schedule.dateRangeType] ?? schedule.dateRangeType}
                      </p>
                    </td>
                    <td className="px-5 py-3 text-[13px] font-bold text-[#4E5968]">{schedule.runTime}</td>
                    <td className="px-5 py-3">
                      <div className="flex flex-wrap gap-1.5">
                        {schedule.mallKeys.map((mallKey) => (
                          <span key={mallKey} className="px-2 py-0.5 rounded-lg bg-slate-100 text-[11px] font-bold text-[#4E5968]">
                            {mallKey}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-5 py-3 text-[12px] text-[#8B95A1]">{formatText(schedule.nextRunAt)}</td>
                    <td className="px-5 py-3">
                      <div className="flex flex-col gap-1">
                        <span className={`w-fit px-2.5 py-0.5 rounded-lg text-[11px] font-bold ${
                          schedule.enabledYn === 'Y' ? 'bg-[#E8FAF0] text-[#00A661]' : 'bg-slate-100 text-[#8B95A1]'
                        }`}>
                          {schedule.enabledYn === 'Y' ? 'ON' : 'OFF'}
                        </span>
                        {schedule.runningYn === 'Y' && (
                          <span className="text-[11px] font-bold text-[#3182F6]">실행 중</span>
                        )}
                        {schedule.lastErrorMessage && (
                          <span className="max-w-[180px] truncate text-[11px] text-red-500" title={schedule.lastErrorMessage}>
                            {schedule.lastErrorMessage}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => startEdit(schedule)}
                          className="px-3 py-1.5 text-[12px] font-bold rounded-xl bg-slate-100 text-[#4E5968] hover:bg-slate-200"
                        >
                          수정
                        </button>
                        <button
                          onClick={() => void toggleEnabled(schedule)}
                          className="px-3 py-1.5 text-[12px] font-bold rounded-xl bg-blue-50 text-[#3182F6] hover:bg-blue-100"
                        >
                          {schedule.enabledYn === 'Y' ? '중지' : '시작'}
                        </button>
                        <button
                          onClick={() => void deleteSchedule(schedule.id)}
                          className="px-3 py-1.5 text-[12px] font-bold rounded-xl bg-red-50 text-red-600 hover:bg-red-100"
                        >
                          삭제
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </section>
      </div>

      <section className="mt-6 bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100">
          <h2 className="text-[16px] font-extrabold text-[#191F28]">최근 배치 실행 이력</h2>
        </div>
        <table className="w-full">
          <thead>
            <tr className="bg-[#FAFAFA] border-b border-slate-100">
              <th className="px-5 py-3 text-left text-[11px] font-semibold text-[#8B95A1] uppercase tracking-wide">작업명</th>
              <th className="px-5 py-3 text-left text-[11px] font-semibold text-[#8B95A1] uppercase tracking-wide">상태</th>
              <th className="px-5 py-3 text-left text-[11px] font-semibold text-[#8B95A1] uppercase tracking-wide">채널</th>
              <th className="px-5 py-3 text-left text-[11px] font-semibold text-[#8B95A1] uppercase tracking-wide">기간</th>
              <th className="px-5 py-3 text-left text-[11px] font-semibold text-[#8B95A1] uppercase tracking-wide">Job</th>
              <th className="px-5 py-3 text-left text-[11px] font-semibold text-[#8B95A1] uppercase tracking-wide">시각</th>
            </tr>
          </thead>
          <tbody>
            {runLogs.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-5 py-10 text-center text-[13px] text-[#8B95A1]">
                  아직 실행 이력이 없습니다.
                </td>
              </tr>
            ) : (
              runLogs.map((log) => (
                <tr key={log.id} className="border-t border-slate-50 hover:bg-slate-50">
                  <td className="px-5 py-3">
                    <p className="text-[13px] font-bold text-[#191F28]">{log.scheduleName}</p>
                    {log.errorMessage && (
                      <p className="mt-1 max-w-[260px] truncate text-[11px] text-red-500" title={log.errorMessage}>
                        {log.errorMessage}
                      </p>
                    )}
                  </td>
                  <td className="px-5 py-3">
                    <span className={`px-2.5 py-0.5 rounded-lg text-[11px] font-bold ${
                      log.status === 'SUCCESS'
                        ? 'bg-[#E8FAF0] text-[#00A661]'
                        : log.status === 'FAILED'
                          ? 'bg-red-50 text-red-600'
                          : 'bg-blue-50 text-[#3182F6]'
                    }`}>
                      {log.status}
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex flex-wrap gap-1.5">
                      {log.mallKeys.map((mallKey) => (
                        <span key={mallKey} className="px-2 py-0.5 rounded-lg bg-slate-100 text-[11px] font-bold text-[#4E5968]">
                          {mallKey}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-5 py-3 text-[12px] text-[#4E5968]">{formatJobDate(log.frDt)} ~ {formatJobDate(log.toDt)}</td>
                  <td className="px-5 py-3 text-[13px] font-bold text-[#4E5968]">{log.jobCount}</td>
                  <td className="px-5 py-3 text-[12px] text-[#8B95A1]">{formatText(log.finishedAt ?? log.startedAt)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>
    </Layout>
  )
}

function formatJobDate(value: string): string {
  if (/^\d{8}$/.test(value)) {
    return `${value.slice(4, 6)}/${value.slice(6, 8)}`
  }
  return value || '-'
}
