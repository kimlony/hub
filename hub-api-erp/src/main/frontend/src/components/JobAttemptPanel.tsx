import { useCallback, useEffect, useState } from 'react'
import { fetchJobAttempts, type JobAttempt } from '../api/jobExecution'
import { useAuthenticatedFetch } from '../hooks/useAuthenticatedFetch'
import JobAttemptTimeline from './JobAttemptTimeline'

export default function JobAttemptPanel({ jobId }: { jobId: string }) {
  const authenticatedFetch = useAuthenticatedFetch()
  const [attempts, setAttempts] = useState<JobAttempt[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadAttempts = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setAttempts(await fetchJobAttempts(authenticatedFetch, jobId))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '처리 시도 이력을 조회하지 못했습니다.')
    } finally {
      setLoading(false)
    }
  }, [authenticatedFetch, jobId])

  useEffect(() => {
    void loadAttempts()
  }, [loadAttempts])

  return (
    <section className="mt-8 border-t border-slate-100 pt-6" aria-labelledby="job-attempts-heading">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h3 id="job-attempts-heading" className="text-[15px] font-extrabold text-[#191F28]">처리 시도 이력</h3>
          <p className="mt-1 text-[12px] text-[#8B95A1]">Claim, Recovery, lease 만료와 stale 결과 거절 흐름을 조회합니다.</p>
        </div>
        <button
          type="button"
          onClick={() => void loadAttempts()}
          className="shrink-0 rounded-lg bg-slate-100 px-3 py-1.5 text-[12px] font-bold text-[#4E5968] hover:bg-slate-200"
        >
          새로고침
        </button>
      </div>

      {loading ? (
        <div className="py-10 text-center text-[13px] text-[#8B95A1]">처리 시도 이력을 불러오는 중...</div>
      ) : error ? (
        <div className="py-8 text-center text-[13px] text-red-600">
          <p>{error}</p>
          <button type="button" onClick={() => void loadAttempts()} className="mt-3 text-[12px] font-bold text-[#3182F6] hover:underline">다시 시도</button>
        </div>
      ) : (
        <JobAttemptTimeline attempts={attempts} />
      )}
    </section>
  )
}
