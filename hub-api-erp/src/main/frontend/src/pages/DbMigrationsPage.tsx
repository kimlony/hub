import { useCallback, useEffect, useMemo, useState } from 'react'
import Layout from '../components/Layout'
import { useAuthenticatedFetch } from '../hooks/useAuthenticatedFetch'

type MigrationItem = {
  version: string | null
  description: string
  script: string
  state: string
  installedOn: string | null
  installedBy: string | null
  executionTime: number | null
  checksum: number | null
}

type DbMigrationStatus = {
  currentVersion: string | null
  latestKnownVersion: string | null
  schemaUpToDate: boolean
  appliedCount: number
  pendingCount: number
  failedCount: number
  migrations: MigrationItem[]
}

export default function DbMigrationsPage() {
  const authenticatedFetch = useAuthenticatedFetch()
  const [data, setData] = useState<DbMigrationStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const fetchStatus = useCallback(async () => {
    setError('')
    try {
      const response = await authenticatedFetch('/api/admin/db-migrations')
      if (!response.ok) {
        throw new Error(`DB migration API failed: ${response.status}`)
      }
      setData(await response.json() as DbMigrationStatus)
    } catch (err) {
      if ((err as Error).message !== 'Authentication required') {
        setError('DB migration 상태를 불러오지 못했습니다.')
      }
    } finally {
      setLoading(false)
    }
  }, [authenticatedFetch])

  useEffect(() => {
    void fetchStatus()
  }, [fetchStatus])

  const cards = useMemo(() => [
    { label: '현재 DB 버전', value: data?.currentVersion ?? '-', color: 'bg-[#191F28] text-white' },
    { label: '앱 최신 버전', value: data?.latestKnownVersion ?? '-', color: 'bg-[#EBF3FE] text-[#3182F6]' },
    { label: 'Pending', value: data?.pendingCount ?? 0, color: (data?.pendingCount ?? 0) > 0 ? 'bg-amber-50 text-amber-700' : 'bg-[#E8FAF0] text-[#00A661]' },
    { label: 'Failed', value: data?.failedCount ?? 0, color: (data?.failedCount ?? 0) > 0 ? 'bg-red-50 text-red-600' : 'bg-slate-100 text-[#4E5968]' },
  ], [data])

  return (
    <Layout
      title="DB Migration 현황"
      actions={
        <button
          onClick={() => { setLoading(true); void fetchStatus() }}
          className="px-4 py-2 text-[13px] font-semibold rounded-xl bg-[#F2F4F6] text-[#4E5968] hover:bg-slate-200 transition-colors"
        >
          새로고침
        </button>
      }
    >
      <div className="space-y-5">
        {error && (
          <div className="rounded-lg border border-red-100 bg-red-50 px-4 py-3 text-[13px] font-semibold text-red-600">
            {error}
          </div>
        )}

        <div className="grid grid-cols-4 gap-4">
          {cards.map((card) => (
            <div key={card.label} className={`rounded-lg px-5 py-4 ${card.color}`}>
              <p className="text-[12px] font-bold opacity-80">{card.label}</p>
              <p className="mt-2 truncate text-[22px] font-extrabold leading-none">{card.value}</p>
            </div>
          ))}
        </div>

        <div className="rounded-lg bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
            <div>
              <h2 className="text-[14px] font-extrabold text-[#191F28]">Migration 목록</h2>
              <p className="mt-1 text-[12px] font-medium text-[#8B95A1]">
                {data?.schemaUpToDate ? 'DB 스키마가 애플리케이션 migration과 일치합니다.' : '적용 대기 또는 실패 migration을 확인해야 합니다.'}
              </p>
            </div>
            <span className={`rounded-full px-3 py-1 text-[12px] font-extrabold ${data?.schemaUpToDate ? 'bg-[#E8FAF0] text-[#00A661]' : 'bg-amber-50 text-amber-700'}`}>
              {data?.schemaUpToDate ? 'UP TO DATE' : 'CHECK'}
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-left">
              <thead>
                <tr className="bg-[#FAFAFA] text-[11px] font-bold uppercase tracking-wide text-[#8B95A1]">
                  <th className="px-5 py-3">Version</th>
                  <th className="px-5 py-3">Description</th>
                  <th className="px-5 py-3">Script</th>
                  <th className="px-5 py-3">State</th>
                  <th className="px-5 py-3">Installed On</th>
                  <th className="px-5 py-3 text-right">Time</th>
                  <th className="px-5 py-3 text-right">Checksum</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {loading && (
                  <tr>
                    <td colSpan={7} className="px-5 py-10 text-center text-[13px] font-semibold text-[#8B95A1]">불러오는 중입니다.</td>
                  </tr>
                )}
                {!loading && data?.migrations.map((migration) => (
                  <tr key={`${migration.version ?? 'repeatable'}-${migration.script}`} className="text-[13px] text-[#4E5968]">
                    <td className="whitespace-nowrap px-5 py-3 font-extrabold text-[#191F28]">{migration.version ?? '-'}</td>
                    <td className="px-5 py-3 font-semibold">{migration.description}</td>
                    <td className="px-5 py-3 font-mono text-[12px] text-[#64748B]">{migration.script}</td>
                    <td className="px-5 py-3">
                      <span className={`rounded-full px-2.5 py-1 text-[11px] font-extrabold ${stateClass(migration.state)}`}>
                        {migration.state}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-5 py-3">{formatDateTime(migration.installedOn)}</td>
                    <td className="px-5 py-3 text-right font-semibold">{migration.executionTime == null ? '-' : `${migration.executionTime}ms`}</td>
                    <td className="px-5 py-3 text-right font-mono text-[12px]">{migration.checksum ?? '-'}</td>
                  </tr>
                ))}
                {!loading && !data?.migrations.length && (
                  <tr>
                    <td colSpan={7} className="px-5 py-10 text-center text-[13px] font-semibold text-[#8B95A1]">migration 정보가 없습니다.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </Layout>
  )
}

function stateClass(state: string) {
  if (state.includes('Failed')) return 'bg-red-50 text-red-600'
  if (state.includes('Pending')) return 'bg-amber-50 text-amber-700'
  if (state.includes('Success')) return 'bg-[#E8FAF0] text-[#00A661]'
  return 'bg-slate-100 text-[#4E5968]'
}

function formatDateTime(value: string | null) {
  if (!value) return '-'
  return new Intl.DateTimeFormat('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}