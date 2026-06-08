import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import Layout from '../components/Layout'
import { useAuthenticatedFetch } from '../hooks/useAuthenticatedFetch'

type ExternalTab = 'clients' | 'guide' | 'logs'

type ExternalClient = {
  id: number
  clientName: string
  clientId: string
  scopes: string[]
  status: string
  tokenTtlSeconds: number
  signatureValidSeconds: number
  allowedIps: string[]
  lastCalledAt?: string | null
  secretRotatedAt?: string | null
  disabledAt?: string | null
  createdAt?: string | null
  updatedAt?: string | null
}

type CreateClientResponse = {
  client: ExternalClient
  clientSecret: string
  warning: string
}

type ApiLog = {
  time: string
  clientId: string
  method: string
  endpoint: string
  status: number
  latencyMs: number
  ip: string
  result: string
}

const logs: ApiLog[] = [
  {
    time: '2026-06-08 16:42:11',
    clientId: 'client_erp_demo_01',
    method: 'GET',
    endpoint: '/api/external/orders',
    status: 200,
    latencyMs: 142,
    ip: '203.0.113.10',
    result: 'SUCCESS',
  },
  {
    time: '2026-06-08 16:41:54',
    clientId: 'client_wms_sync_01',
    method: 'POST',
    endpoint: '/api/external/auth/token',
    status: 200,
    latencyMs: 37,
    ip: '203.0.113.21',
    result: 'TOKEN_ISSUED',
  },
  {
    time: '2026-06-08 16:40:03',
    clientId: 'client_partner_test_01',
    method: 'GET',
    endpoint: '/api/external/orders',
    status: 403,
    latencyMs: 18,
    ip: '203.0.113.32',
    result: 'CLIENT_DISABLED',
  },
  {
    time: '2026-06-08 16:37:22',
    clientId: 'client_erp_demo_01',
    method: 'POST',
    endpoint: '/api/external/auth/token',
    status: 401,
    latencyMs: 21,
    ip: '203.0.113.10',
    result: 'INVALID_SIGNATURE',
  },
]

const tabs: Array<{ value: ExternalTab; label: string }> = [
  { value: 'clients', label: '클라이언트 관리' },
  { value: 'guide', label: 'API 가이드' },
  { value: 'logs', label: '호출 로그' },
]

const signatureExample = [
  'timestamp = "2026-06-08T16:42:00+09:00"',
  'message = `${clientId}.${timestamp}`',
  'signature = HMAC_SHA256(clientSecret, message)',
].join('\n')

const tokenRequestExample = [
  'POST /api/external/auth/token',
  'X-BizBee-Client-Id: client_1_abcd1234',
  'X-BizBee-Timestamp: 2026-06-08T16:42:00+09:00',
  'X-BizBee-Signature: 47b1...a92f',
].join('\n')

const tokenResponseExample = [
  '{',
  '  "accessToken": "eyJhbGciOiJIUzI1NiIs...",',
  '  "tokenType": "Bearer",',
  '  "expiresIn": 1800,',
  '  "scope": "orders:read"',
  '}',
].join('\n')

const orderRequestExample = [
  'GET /api/external/orders?channelCd=NAVER&frDt=20260608&toDt=20260608&page=1&size=50',
  'Authorization: Bearer eyJhbGciOiJIUzI1NiIs...',
].join('\n')

export default function ExternalApiPage() {
  const authenticatedFetch = useAuthenticatedFetch()
  const [activeTab, setActiveTab] = useState<ExternalTab>('clients')
  const [clients, setClients] = useState<ExternalClient[]>([])
  const [loading, setLoading] = useState(false)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [clientName, setClientName] = useState('')
  const [issuedSecret, setIssuedSecret] = useState<CreateClientResponse | null>(null)

  const fetchClients = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await authenticatedFetch('/api/hub/external/clients')
      if (!response.ok) {
        throw new Error(`클라이언트 목록 조회 실패 (${response.status})`)
      }
      const data = await response.json() as ExternalClient[]
      setClients(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : '클라이언트 목록을 불러오지 못했습니다.')
    } finally {
      setLoading(false)
    }
  }, [authenticatedFetch])

  useEffect(() => {
    void fetchClients()
  }, [fetchClients])

  async function handleCreateClient(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const trimmedName = clientName.trim()
    if (!trimmedName) {
      setError('클라이언트명을 입력해주세요.')
      return
    }

    setCreating(true)
    setError(null)
    try {
      const response = await authenticatedFetch('/api/hub/external/clients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientName: trimmedName,
          scopes: ['orders:read'],
          allowedIps: [],
          tokenTtlSeconds: 1800,
          signatureValidSeconds: 300,
        }),
      })
      if (!response.ok) {
        throw new Error(`클라이언트 발급 실패 (${response.status})`)
      }
      const data = await response.json() as CreateClientResponse
      setIssuedSecret(data)
      setClients((prev) => [data.client, ...prev])
      setClientName('')
      setActiveTab('clients')
    } catch (err) {
      setError(err instanceof Error ? err.message : '클라이언트 발급에 실패했습니다.')
    } finally {
      setCreating(false)
    }
  }

  const stats = useMemo(() => {
    const activeCount = clients.filter((client) => client.status === 'ACTIVE').length
    const pausedCount = clients.filter((client) => client.status !== 'ACTIVE').length
    return [
      { label: '활성 클라이언트', value: `${activeCount}개`, caption: '현재 호출 가능' },
      { label: '중지 클라이언트', value: `${pausedCount}개`, caption: '보류/비활성' },
      { label: '토큰 만료 시간', value: '30분', caption: '기본 정책' },
      { label: '서명 허용 오차', value: '5분', caption: '재전송 방지' },
    ]
  }, [clients])

  return (
    <Layout
      title="외부 API 연동"
      actions={
        <button
          onClick={() => setActiveTab('clients')}
          className="px-3 py-2 text-[12px] font-bold rounded-lg bg-[#3182F6] text-white hover:bg-blue-600 transition-colors"
        >
          클라이언트 발급
        </button>
      }
    >
      {issuedSecret && (
        <IssuedSecretPanel
          issued={issuedSecret}
          onClose={() => setIssuedSecret(null)}
        />
      )}

      <div className="space-y-5">
        <section className="bg-white border border-slate-100 rounded-lg">
          <div className="px-5 py-4 border-b border-slate-100 flex items-start justify-between gap-4">
            <div>
              <h2 className="text-[16px] font-extrabold text-[#191F28]">외부 연동 인증 설계</h2>
              <p className="mt-1 text-[12px] text-[#6B7684]">
                사용자가 직접 클라이언트를 발급하고, 외부 시스템은 HMAC 서명으로 짧은 만료 JWT를 발급받아 주문 Export API를 호출합니다.
              </p>
            </div>
            <div className="flex rounded-lg bg-[#F2F4F6] p-1">
              {tabs.map((tab) => (
                <button
                  key={tab.value}
                  onClick={() => setActiveTab(tab.value)}
                  className={
                    'px-3 py-1.5 rounded-md text-[12px] font-bold transition-colors ' +
                    (activeTab === tab.value
                      ? 'bg-white text-[#3182F6] shadow-sm'
                      : 'text-[#6B7684] hover:text-[#191F28]')
                  }
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-4 gap-px bg-slate-100">
            {stats.map((stat) => (
              <div key={stat.label} className="bg-white px-5 py-4">
                <p className="text-[11px] font-semibold text-[#8B95A1]">{stat.label}</p>
                <p className="mt-2 text-[22px] font-extrabold text-[#191F28]">{stat.value}</p>
                <p className="mt-1 text-[11px] text-[#8B95A1]">{stat.caption}</p>
              </div>
            ))}
          </div>
        </section>

        {error && (
          <div className="rounded-lg border border-red-100 bg-red-50 px-4 py-3 text-[12px] font-semibold text-red-600">
            {error}
          </div>
        )}

        {activeTab === 'clients' && (
          <ClientsTab
            clients={clients}
            loading={loading}
            creating={creating}
            clientName={clientName}
            onClientNameChange={setClientName}
            onCreateClient={handleCreateClient}
            onRefresh={() => void fetchClients()}
          />
        )}
        {activeTab === 'guide' && <GuideTab />}
        {activeTab === 'logs' && <LogsTab />}
      </div>
    </Layout>
  )
}

function IssuedSecretPanel({ issued, onClose }: { issued: CreateClientResponse; onClose: () => void }) {
  const [copied, setCopied] = useState<'clientId' | 'clientSecret' | null>(null)

  async function copy(value: string, type: 'clientId' | 'clientSecret') {
    await navigator.clipboard.writeText(value)
    setCopied(type)
    setTimeout(() => setCopied(null), 1500)
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/40 px-4">
      <div className="w-full max-w-2xl rounded-lg bg-white shadow-xl">
        <div className="px-5 py-4 border-b border-slate-100">
          <h3 className="text-[16px] font-extrabold text-[#191F28]">클라이언트 발급 완료</h3>
          <p className="mt-1 text-[12px] text-[#6B7684]">
            Secret은 이 화면에서만 확인할 수 있습니다. 닫기 전에 외부 시스템 설정에 저장해주세요.
          </p>
        </div>
        <div className="p-5 space-y-4">
          <SecretField
            label="Client ID"
            value={issued.client.clientId}
            copied={copied === 'clientId'}
            onCopy={() => void copy(issued.client.clientId, 'clientId')}
          />
          <SecretField
            label="Client Secret"
            value={issued.clientSecret}
            copied={copied === 'clientSecret'}
            onCopy={() => void copy(issued.clientSecret, 'clientSecret')}
          />
          <div className="rounded-lg border border-amber-100 bg-amber-50 px-4 py-3 text-[12px] leading-5 text-amber-700">
            {issued.warning}
          </div>
        </div>
        <div className="px-5 py-4 border-t border-slate-100 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-[#191F28] text-white text-[12px] font-bold hover:bg-slate-700"
          >
            확인했습니다
          </button>
        </div>
      </div>
    </div>
  )
}

function SecretField({ label, value, copied, onCopy }: { label: string; value: string; copied: boolean; onCopy: () => void }) {
  return (
    <div>
      <p className="mb-2 text-[11px] font-bold text-[#8B95A1]">{label}</p>
      <div className="flex items-stretch rounded-lg border border-slate-200 overflow-hidden">
        <code className="flex-1 bg-[#F9FAFB] px-3 py-3 text-[12px] text-[#191F28] overflow-x-auto">
          {value}
        </code>
        <button
          onClick={onCopy}
          className="w-24 bg-white border-l border-slate-200 text-[12px] font-bold text-[#3182F6] hover:bg-[#EBF3FE]"
        >
          {copied ? '복사됨' : '복사'}
        </button>
      </div>
    </div>
  )
}

function ClientsTab({
  clients,
  loading,
  creating,
  clientName,
  onClientNameChange,
  onCreateClient,
  onRefresh,
}: {
  clients: ExternalClient[]
  loading: boolean
  creating: boolean
  clientName: string
  onClientNameChange: (value: string) => void
  onCreateClient: (event: FormEvent<HTMLFormElement>) => void
  onRefresh: () => void
}) {
  return (
    <div className="space-y-5">
      <section className="bg-white border border-slate-100 rounded-lg">
        <div className="px-5 py-4 border-b border-slate-100">
          <h3 className="text-[14px] font-extrabold text-[#191F28]">새 클라이언트 발급</h3>
          <p className="mt-1 text-[12px] text-[#8B95A1]">발급된 Secret은 최초 응답에서만 표시됩니다.</p>
        </div>
        <form onSubmit={onCreateClient} className="p-5 grid grid-cols-[1fr_160px_120px] gap-3 items-end">
          <label>
            <span className="mb-2 block text-[11px] font-bold text-[#8B95A1]">클라이언트명</span>
            <input
              value={clientName}
              onChange={(event) => onClientNameChange(event.target.value)}
              placeholder="예: ERP Demo"
              className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-[13px] outline-none focus:border-[#3182F6]"
            />
          </label>
          <label>
            <span className="mb-2 block text-[11px] font-bold text-[#8B95A1]">기본 권한</span>
            <input
              value="orders:read"
              disabled
              className="w-full rounded-lg border border-slate-200 bg-[#F9FAFB] px-3 py-2.5 text-[13px] text-[#6B7684]"
            />
          </label>
          <button
            type="submit"
            disabled={creating}
            className="h-[42px] rounded-lg bg-[#3182F6] px-4 text-[12px] font-bold text-white hover:bg-blue-600 disabled:bg-slate-300"
          >
            {creating ? '발급 중' : '발급'}
          </button>
        </form>
      </section>

      <section className="bg-white border border-slate-100 rounded-lg overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h3 className="text-[14px] font-extrabold text-[#191F28]">내 클라이언트 목록</h3>
            <p className="mt-1 text-[12px] text-[#8B95A1]">Secret은 목록에 표시되지 않습니다. 분실 시 재발급이 필요합니다.</p>
          </div>
          <button
            onClick={onRefresh}
            className="px-3 py-2 text-[12px] font-bold rounded-lg bg-[#F2F4F6] text-[#4E5968] hover:bg-slate-200"
          >
            새로고침
          </button>
        </div>
        <table className="w-full text-left">
          <thead className="bg-[#F9FAFB] text-[11px] font-bold text-[#8B95A1]">
            <tr>
              <th className="px-5 py-3">클라이언트</th>
              <th className="px-5 py-3">CLIENT ID</th>
              <th className="px-5 py-3">권한</th>
              <th className="px-5 py-3">상태</th>
              <th className="px-5 py-3">토큰 TTL</th>
              <th className="px-5 py-3">마지막 호출</th>
              <th className="px-5 py-3">생성 시각</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading && (
              <tr>
                <td colSpan={7} className="px-5 py-10 text-center text-[12px] text-[#8B95A1]">
                  클라이언트 목록을 불러오는 중입니다.
                </td>
              </tr>
            )}
            {!loading && clients.length === 0 && (
              <tr>
                <td colSpan={7} className="px-5 py-10 text-center text-[12px] text-[#8B95A1]">
                  아직 발급된 클라이언트가 없습니다.
                </td>
              </tr>
            )}
            {!loading && clients.map((client) => (
              <tr key={client.clientId} className="text-[12px] text-[#4E5968]">
                <td className="px-5 py-4">
                  <p className="font-extrabold text-[#191F28]">{client.clientName}</p>
                  <p className="mt-0.5 text-[11px] text-[#8B95A1]">Secret 회전 {client.secretRotatedAt ?? '-'}</p>
                </td>
                <td className="px-5 py-4 font-mono text-[11px]">{client.clientId}</td>
                <td className="px-5 py-4">
                  <div className="flex flex-wrap gap-1">
                    {client.scopes.map((scope) => (
                      <span key={scope} className="rounded-md bg-[#EBF3FE] px-2 py-1 text-[11px] font-bold text-[#3182F6]">
                        {scope}
                      </span>
                    ))}
                  </div>
                </td>
                <td className="px-5 py-4">
                  <StatusBadge status={client.status} />
                </td>
                <td className="px-5 py-4">{Math.floor(client.tokenTtlSeconds / 60)}분</td>
                <td className="px-5 py-4">{client.lastCalledAt ?? '-'}</td>
                <td className="px-5 py-4">{client.createdAt ?? '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  )
}

function GuideTab() {
  return (
    <div className="grid grid-cols-[360px_1fr] gap-5">
      <section className="bg-white border border-slate-100 rounded-lg p-5">
        <h3 className="text-[14px] font-extrabold text-[#191F28]">인증 흐름</h3>
        <div className="mt-4 space-y-3">
          {[
            '화면에서 클라이언트를 발급하고 Client Secret을 외부 시스템에 저장합니다.',
            '외부 시스템은 clientId와 timestamp로 HMAC 서명을 만듭니다.',
            '서명 검증이 성공하면 30분짜리 JWT를 발급합니다.',
            '주문 Export API는 Bearer Token과 scope를 확인합니다.',
            '모든 호출은 감사 로그와 실패 사유로 남깁니다.',
          ].map((step, index) => (
            <div key={step} className="flex gap-3">
              <span className="w-6 h-6 rounded-md bg-[#3182F6] text-white text-[11px] font-extrabold flex items-center justify-center">
                {index + 1}
              </span>
              <p className="pt-0.5 text-[12px] leading-5 text-[#4E5968]">{step}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="bg-white border border-slate-100 rounded-lg overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100">
          <h3 className="text-[14px] font-extrabold text-[#191F28]">연동 가이드</h3>
          <p className="mt-1 text-[12px] text-[#8B95A1]">외부 시스템은 먼저 토큰을 발급받은 뒤 주문 Export API를 호출합니다.</p>
        </div>
        <div className="p-5 grid grid-cols-2 gap-4">
          <CodeBlock title="서명 생성" code={signatureExample} />
          <CodeBlock title="토큰 발급 요청" code={tokenRequestExample} />
          <CodeBlock title="토큰 발급 응답" code={tokenResponseExample} />
          <CodeBlock title="주문 Export 호출" code={orderRequestExample} />
        </div>
        <div className="px-5 pb-5">
          <h4 className="text-[12px] font-extrabold text-[#191F28] mb-2">대표 오류 코드</h4>
          <div className="grid grid-cols-5 gap-2">
            {['INVALID_SIGNATURE', 'TIMESTAMP_EXPIRED', 'CLIENT_DISABLED', 'TOKEN_EXPIRED', 'RATE_LIMITED'].map((code) => (
              <div key={code} className="rounded-lg border border-slate-100 bg-[#F9FAFB] px-3 py-2 font-mono text-[11px] text-[#4E5968]">
                {code}
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  )
}

function LogsTab() {
  return (
    <section className="bg-white border border-slate-100 rounded-lg overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-100">
        <h3 className="text-[14px] font-extrabold text-[#191F28]">최근 호출 로그</h3>
        <p className="mt-1 text-[12px] text-[#8B95A1]">서명 실패, 토큰 만료, 제한 초과 같은 운영 이슈를 추적합니다.</p>
      </div>
      <table className="w-full text-left">
        <thead className="bg-[#F9FAFB] text-[11px] font-bold text-[#8B95A1]">
          <tr>
            <th className="px-5 py-3">시간</th>
            <th className="px-5 py-3">CLIENT ID</th>
            <th className="px-5 py-3">요청</th>
            <th className="px-5 py-3">상태</th>
            <th className="px-5 py-3">지연</th>
            <th className="px-5 py-3">IP</th>
            <th className="px-5 py-3">결과</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {logs.map((log) => (
            <tr key={`${log.time}-${log.result}`} className="text-[12px] text-[#4E5968]">
              <td className="px-5 py-4">{log.time}</td>
              <td className="px-5 py-4 font-mono text-[11px]">{log.clientId}</td>
              <td className="px-5 py-4">
                <span className="font-extrabold text-[#191F28]">{log.method}</span>
                <span className="ml-2 font-mono text-[11px]">{log.endpoint}</span>
              </td>
              <td className="px-5 py-4">
                <span className={`rounded-md px-2 py-1 text-[11px] font-extrabold ${log.status < 300 ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600'}`}>
                  {log.status}
                </span>
              </td>
              <td className="px-5 py-4">{log.latencyMs}ms</td>
              <td className="px-5 py-4">{log.ip}</td>
              <td className="px-5 py-4 font-mono text-[11px]">{log.result}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}

function StatusBadge({ status }: { status: string }) {
  const active = status === 'ACTIVE'
  return (
    <span className={`rounded-md px-2 py-1 text-[11px] font-extrabold ${active ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'}`}>
      {status}
    </span>
  )
}

function CodeBlock({ title, code }: { title: string; code: string }) {
  return (
    <div className="rounded-lg border border-slate-100 overflow-hidden">
      <div className="px-3 py-2 bg-[#F9FAFB] border-b border-slate-100 text-[12px] font-extrabold text-[#191F28]">
        {title}
      </div>
      <pre className="p-3 text-[11px] leading-5 text-[#4E5968] overflow-x-auto bg-white">
        <code>{code}</code>
      </pre>
    </div>
  )
}
