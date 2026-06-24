package hub.loadtest.service;

import hub.job.dto.request.HubJobBatchRequest;
import hub.job.dto.response.HubJobBatchResponse;
import hub.job.service.HubJobService;
import hub.loadtest.dto.request.MockMallLoadTestRequest;
import hub.loadtest.dto.response.MockMallLoadTestStartResponse;
import hub.loadtest.dto.response.MockMallLoadTestStatusResponse;
import jakarta.annotation.PostConstruct;
import java.sql.Timestamp;
import java.time.format.DateTimeFormatter;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class MockMallLoadTestService {

    private static final DateTimeFormatter DATE_FORMAT = DateTimeFormatter.ofPattern("yyyyMMdd");
    private static final DateTimeFormatter RUN_ID_FORMAT = DateTimeFormatter.ofPattern("yyyyMMdd-HHmmss");
    private static final ZoneId SEOUL = ZoneId.of("Asia/Seoul");

    private final HubJobService hubJobService;
    private final JdbcTemplate jdbcTemplate;

    @PostConstruct
    public void initializeSchema() {
        ensureLoadTestSchema();
    }

    @Transactional
    public MockMallLoadTestStartResponse start(String username, MockMallLoadTestRequest request) {
        ensureLoadTestSchema();

        int orders = positive(request.orders(), 100000);
        int pageSize = positive(request.pageSize(), 100);
        int totalPages = (int) Math.ceil(orders / (double) pageSize);
        String runId = "ui-load-" + LocalDateTime.now(SEOUL).format(RUN_ID_FORMAT);
        String scenario = textOrDefault(request.scenario(), "ui-e2e-current-env");
        String seed = textOrDefault(request.seed(), "mock-load-test-ui-001");
        int delayMs = nonNegative(request.delayMs(), 0);
        double errorRate = rate(request.errorRate());
        double timeoutRate = rate(request.timeoutRate());
        LocalDate baseDate = LocalDate.of(2026, 1, 1);
        List<String> requestIds = new ArrayList<>();

        insertStartedRun(runId, scenario, orders, pageSize, totalPages, seed, delayMs, errorRate, timeoutRate);

        for (int page = 1; page <= totalPages; page += 1) {
            String date = baseDate.plusDays(page - 1L).format(DATE_FORMAT);
            HubJobBatchRequest batchRequest = new HubJobBatchRequest(
                    date,
                    date,
                    List.of("MOCK_MALL"),
                    page,
                    pageSize,
                    orders,
                    seed,
                    delayMs,
                    errorRate,
                    timeoutRate,
                    runId,
                    scenario
            );

            HubJobBatchResponse response = hubJobService.createBatchJobs(username, batchRequest);
            response.jobs().stream()
                    .map(HubJobBatchResponse.JobResult::requestId)
                    .forEach(requestIds::add);
        }

        return new MockMallLoadTestStartResponse(runId, scenario, orders, pageSize, totalPages, requestIds);
    }

    @Transactional
    public MockMallLoadTestStatusResponse status(String runId) {
        ensureLoadTestSchema();

        RunRecord run = runRecord(runId);
        CollectStats collectStats = collectStats(runId);
        NormalizeStats normalizeStats = normalizeStats(runId);
        MockMallLoadTestStatusResponse.OutboxStatus outboxStatus = outboxStatus(runId);
        int normalizedOrders = normalizedOrders(runId);
        DurationStats durationStats = durationStats(runId);
        boolean completed = isCompleted(collectStats, normalizeStats);
        boolean failed = completed && (collectStats.failed() > 0 || normalizeStats.failed() > 0 || outboxStatus.failed() > 0);
        String runStatus = completed ? (failed ? "FAILED" : "SUCCESS") : "RUNNING";
        long elapsedMs = elapsedMs(run, completed);
        RateStats rates = rateStats(elapsedMs, normalizedOrders, collectStats, normalizeStats);

        updateRunProgress(
                runId,
                runStatus,
                collectStats,
                normalizeStats,
                outboxStatus,
                normalizedOrders,
                elapsedMs,
                rates,
                durationStats,
                completed
        );

        List<MockMallLoadTestStatusResponse.LogLine> logs = logs(runId);
        List<MockMallLoadTestStatusResponse.RunSummary> recentRuns = recentRuns();

        return new MockMallLoadTestStatusResponse(
                runId,
                run.scenario(),
                runStatus,
                elapsedMs,
                rates.ordersPerSecond(),
                rates.jobsPerSecond(),
                rates.throughputPerMinute(),
                durationStats.avgMs(),
                durationStats.p50Ms(),
                durationStats.p95Ms(),
                durationStats.maxMs(),
                collectStats.total(),
                collectStats.queued(),
                collectStats.processing(),
                collectStats.success(),
                collectStats.failed(),
                normalizeStats.total(),
                normalizeStats.success(),
                normalizeStats.failed(),
                normalizedOrders,
                outboxStatus,
                logs,
                recentRuns
        );
    }

    @Transactional
    public List<MockMallLoadTestStatusResponse.RunSummary> history() {
        ensureLoadTestSchema();
        return recentRuns();
    }

    private void ensureLoadTestSchema() {
        jdbcTemplate.execute("""
                CREATE TABLE IF NOT EXISTS hub_load_test_run (
                  id BIGSERIAL PRIMARY KEY,
                  run_id VARCHAR(80) NOT NULL UNIQUE,
                  mode VARCHAR(30) NOT NULL,
                  total_requested INTEGER NOT NULL,
                  total_jobs INTEGER NOT NULL,
                  completed_jobs INTEGER NOT NULL,
                  success_jobs INTEGER NOT NULL,
                  failed_jobs INTEGER NOT NULL,
                  elapsed_ms BIGINT NOT NULL,
                  throughput_per_minute DOUBLE PRECISION NOT NULL,
                  avg_duration_ms DOUBLE PRECISION NOT NULL,
                  p50_duration_ms DOUBLE PRECISION NOT NULL,
                  p95_duration_ms DOUBLE PRECISION NOT NULL,
                  max_duration_ms DOUBLE PRECISION NOT NULL,
                  params JSONB NOT NULL DEFAULT '{}'::jsonb,
                  result_path VARCHAR(500),
                  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                )
                """);
        jdbcTemplate.execute("""
                ALTER TABLE hub_load_test_run
                    ADD COLUMN IF NOT EXISTS scenario VARCHAR(120),
                    ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'SUCCESS',
                    ADD COLUMN IF NOT EXISTS page_size INTEGER,
                    ADD COLUMN IF NOT EXISTS total_collect_jobs INTEGER NOT NULL DEFAULT 0,
                    ADD COLUMN IF NOT EXISTS total_normalize_jobs INTEGER NOT NULL DEFAULT 0,
                    ADD COLUMN IF NOT EXISTS completed_normalize_jobs INTEGER NOT NULL DEFAULT 0,
                    ADD COLUMN IF NOT EXISTS normalized_orders INTEGER NOT NULL DEFAULT 0,
                    ADD COLUMN IF NOT EXISTS orders_per_second DOUBLE PRECISION NOT NULL DEFAULT 0,
                    ADD COLUMN IF NOT EXISTS jobs_per_second DOUBLE PRECISION NOT NULL DEFAULT 0,
                    ADD COLUMN IF NOT EXISTS outbox_total INTEGER NOT NULL DEFAULT 0,
                    ADD COLUMN IF NOT EXISTS outbox_pending INTEGER NOT NULL DEFAULT 0,
                    ADD COLUMN IF NOT EXISTS outbox_publishing INTEGER NOT NULL DEFAULT 0,
                    ADD COLUMN IF NOT EXISTS outbox_sent INTEGER NOT NULL DEFAULT 0,
                    ADD COLUMN IF NOT EXISTS outbox_failed INTEGER NOT NULL DEFAULT 0,
                    ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ,
                    ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ,
                    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                """);
        jdbcTemplate.execute("""
                CREATE INDEX IF NOT EXISTS idx_hub_load_test_run_created_at
                ON hub_load_test_run(created_at DESC)
                """);
        jdbcTemplate.execute("""
                CREATE INDEX IF NOT EXISTS idx_hub_load_test_run_status
                ON hub_load_test_run(status, created_at DESC)
                """);
    }

    private void insertStartedRun(
            String runId,
            String scenario,
            int orders,
            int pageSize,
            int totalPages,
            String seed,
            int delayMs,
            double errorRate,
            double timeoutRate
    ) {
        jdbcTemplate.update(
                """
                        INSERT INTO hub_load_test_run (
                            run_id,
                            mode,
                            scenario,
                            status,
                            total_requested,
                            page_size,
                            total_jobs,
                            total_collect_jobs,
                            completed_jobs,
                            success_jobs,
                            failed_jobs,
                            elapsed_ms,
                            throughput_per_minute,
                            avg_duration_ms,
                            p50_duration_ms,
                            p95_duration_ms,
                            max_duration_ms,
                            params,
                            started_at,
                            created_at,
                            updated_at
                        ) VALUES (
                            ?, 'mock-mall-e2e', ?, 'RUNNING', ?, ?, ?, ?,
                            0, 0, 0, 0, 0, 0, 0, 0, 0,
                            jsonb_build_object(
                                'scenario', ?,
                                'orders', ?,
                                'pageSize', ?,
                                'seed', ?,
                                'delayMs', ?,
                                'errorRate', ?,
                                'timeoutRate', ?
                            ),
                            NOW(), NOW(), NOW()
                        )
                        ON CONFLICT (run_id) DO UPDATE SET
                            scenario = EXCLUDED.scenario,
                            status = 'RUNNING',
                            total_requested = EXCLUDED.total_requested,
                            page_size = EXCLUDED.page_size,
                            total_jobs = EXCLUDED.total_jobs,
                            total_collect_jobs = EXCLUDED.total_collect_jobs,
                            completed_jobs = 0,
                            success_jobs = 0,
                            failed_jobs = 0,
                            elapsed_ms = 0,
                            throughput_per_minute = 0,
                            avg_duration_ms = 0,
                            p50_duration_ms = 0,
                            p95_duration_ms = 0,
                            max_duration_ms = 0,
                            orders_per_second = 0,
                            jobs_per_second = 0,
                            params = EXCLUDED.params,
                            started_at = NOW(),
                            completed_at = NULL,
                            updated_at = NOW()
                        """,
                runId,
                scenario,
                orders,
                pageSize,
                totalPages,
                totalPages,
                scenario,
                orders,
                pageSize,
                seed,
                delayMs,
                errorRate,
                timeoutRate
        );
    }

    private RunRecord runRecord(String runId) {
        return jdbcTemplate.queryForObject(
                """
                        SELECT
                            run_id,
                            COALESCE(scenario, params ->> 'scenario', run_id) AS scenario,
                            COALESCE(status, 'RUNNING') AS status,
                            COALESCE(started_at, created_at, NOW()) AS started_at,
                            completed_at
                        FROM hub_load_test_run
                        WHERE run_id = ?
                        """,
                (rs, rowNum) -> new RunRecord(
                        rs.getString("run_id"),
                        rs.getString("scenario"),
                        rs.getString("status"),
                        toInstant(rs.getTimestamp("started_at")),
                        toInstant(rs.getTimestamp("completed_at"))
                ),
                runId
        );
    }

    private CollectStats collectStats(String runId) {
        return jdbcTemplate.queryForObject(
                """
                        SELECT
                            COUNT(*)::int AS total,
                            COUNT(*) FILTER (WHERE status = 'QUEUED')::int AS queued,
                            COUNT(*) FILTER (WHERE status = 'PROCESSING')::int AS processing,
                            COUNT(*) FILTER (WHERE status = 'SUCCESS')::int AS success,
                            COUNT(*) FILTER (WHERE status = 'FAILED')::int AS failed
                        FROM hub_job
                        WHERE payload ->> 'runId' = ?
                          AND job_type = 'ORDER_COLLECT'
                          AND channel_cd = 'MOCK_MALL'
                        """,
                (rs, rowNum) -> new CollectStats(
                        rs.getInt("total"),
                        rs.getInt("queued"),
                        rs.getInt("processing"),
                        rs.getInt("success"),
                        rs.getInt("failed")
                ),
                runId
        );
    }

    private NormalizeStats normalizeStats(String runId) {
        return jdbcTemplate.queryForObject(
                """
                        WITH collect AS (
                            SELECT request_id
                            FROM hub_job
                            WHERE payload ->> 'runId' = ?
                              AND job_type = 'ORDER_COLLECT'
                              AND channel_cd = 'MOCK_MALL'
                        )
                        SELECT
                            COUNT(*)::int AS total,
                            COUNT(*) FILTER (WHERE j.status = 'SUCCESS')::int AS success,
                            COUNT(*) FILTER (WHERE j.status = 'FAILED')::int AS failed
                        FROM hub_job j
                        JOIN collect c ON j.request_key = 'NORMALIZE_' || c.request_id
                        """,
                (rs, rowNum) -> new NormalizeStats(
                        rs.getInt("total"),
                        rs.getInt("success"),
                        rs.getInt("failed")
                ),
                runId
        );
    }

    private MockMallLoadTestStatusResponse.OutboxStatus outboxStatus(String runId) {
        return jdbcTemplate.queryForObject(
                """
                        SELECT
                            COUNT(*)::int AS total,
                            COUNT(*) FILTER (WHERE status = 'PENDING')::int AS pending,
                            COUNT(*) FILTER (WHERE status = 'PUBLISHING')::int AS publishing,
                            COUNT(*) FILTER (WHERE status = 'SENT')::int AS sent,
                            COUNT(*) FILTER (WHERE status = 'FAILED')::int AS failed
                        FROM hub_job_outbox
                        WHERE payload -> 'payload' ->> 'runId' = ?
                        """,
                (rs, rowNum) -> new MockMallLoadTestStatusResponse.OutboxStatus(
                        rs.getInt("total"),
                        rs.getInt("pending"),
                        rs.getInt("publishing"),
                        rs.getInt("sent"),
                        rs.getInt("failed")
                ),
                runId
        );
    }

    private int normalizedOrders(String runId) {
        Integer count = jdbcTemplate.queryForObject(
                """
                        SELECT COUNT(*)::int
                        FROM hub_collected_order
                        WHERE request_id IN (
                            SELECT request_id
                            FROM hub_job_result
                            WHERE result_payload ->> 'runId' = ?
                        )
                        """,
                Integer.class,
                runId
        );
        return count == null ? 0 : count;
    }

    private DurationStats durationStats(String runId) {
        return jdbcTemplate.queryForObject(
                """
                        WITH collect AS (
                            SELECT request_id
                            FROM hub_job
                            WHERE payload ->> 'runId' = ?
                              AND job_type = 'ORDER_COLLECT'
                              AND channel_cd = 'MOCK_MALL'
                        ),
                        target AS (
                            SELECT j.created_at,
                                   COALESCE(j.completed_at, j.updated_at) AS finished_at
                            FROM hub_job j
                            JOIN collect c ON j.request_id = c.request_id
                            WHERE j.status IN ('SUCCESS', 'FAILED')
                            UNION ALL
                            SELECT j.created_at,
                                   COALESCE(j.completed_at, j.updated_at) AS finished_at
                            FROM hub_job j
                            JOIN collect c ON j.request_key = 'NORMALIZE_' || c.request_id
                            WHERE j.status IN ('SUCCESS', 'FAILED')
                        ),
                        durations AS (
                            SELECT EXTRACT(EPOCH FROM (finished_at - created_at)) * 1000.0 AS duration_ms
                            FROM target
                            WHERE finished_at IS NOT NULL
                        )
                        SELECT
                            COALESCE(AVG(duration_ms), 0)::float8 AS avg_ms,
                            COALESCE(percentile_cont(0.5) WITHIN GROUP (ORDER BY duration_ms), 0)::float8 AS p50_ms,
                            COALESCE(percentile_cont(0.95) WITHIN GROUP (ORDER BY duration_ms), 0)::float8 AS p95_ms,
                            COALESCE(MAX(duration_ms), 0)::float8 AS max_ms
                        FROM durations
                        """,
                (rs, rowNum) -> new DurationStats(
                        round1(rs.getDouble("avg_ms")),
                        round1(rs.getDouble("p50_ms")),
                        round1(rs.getDouble("p95_ms")),
                        round1(rs.getDouble("max_ms"))
                ),
                runId
        );
    }

    private List<MockMallLoadTestStatusResponse.LogLine> logs(String runId) {
        return jdbcTemplate.query(
                """
                        WITH collect AS (
                            SELECT request_id
                            FROM hub_job
                            WHERE payload ->> 'runId' = ?
                              AND job_type = 'ORDER_COLLECT'
                              AND channel_cd = 'MOCK_MALL'
                        ),
                        target AS (
                            SELECT request_id FROM collect
                            UNION
                            SELECT j.request_id
                            FROM hub_job j
                            JOIN collect c ON j.request_key = 'NORMALIZE_' || c.request_id
                        )
                        SELECT
                            to_char(l.created_at AT TIME ZONE 'Asia/Seoul', 'HH24:MI:SS') AS created_at,
                            l.request_id,
                            l.event_type,
                            l.level,
                            l.message,
                            l.error_message
                        FROM hub_job_log l
                        JOIN target t ON t.request_id = l.request_id
                        ORDER BY l.created_at DESC, l.id DESC
                        LIMIT 80
                        """,
                (rs, rowNum) -> new MockMallLoadTestStatusResponse.LogLine(
                        rs.getString("created_at"),
                        rs.getString("request_id"),
                        rs.getString("event_type"),
                        rs.getString("level"),
                        rs.getString("message"),
                        rs.getString("error_message")
                ),
                runId
        );
    }

    private List<MockMallLoadTestStatusResponse.RunSummary> recentRuns() {
        return jdbcTemplate.query(
                """
                        SELECT
                            run_id,
                            COALESCE(scenario, params ->> 'scenario', '-') AS scenario,
                            status,
                            total_requested,
                            normalized_orders,
                            elapsed_ms,
                            orders_per_second,
                            jobs_per_second,
                            p95_duration_ms,
                            failed_jobs,
                            to_char(COALESCE(started_at, created_at) AT TIME ZONE 'Asia/Seoul', 'MM-DD HH24:MI:SS') AS started_at,
                            to_char(completed_at AT TIME ZONE 'Asia/Seoul', 'MM-DD HH24:MI:SS') AS completed_at
                        FROM hub_load_test_run
                        WHERE mode IN ('mock-mall-e2e', 'mock-mall')
                        ORDER BY COALESCE(started_at, created_at) DESC
                        LIMIT 12
                        """,
                (rs, rowNum) -> new MockMallLoadTestStatusResponse.RunSummary(
                        rs.getString("run_id"),
                        rs.getString("scenario"),
                        rs.getString("status"),
                        rs.getInt("total_requested"),
                        rs.getInt("normalized_orders"),
                        rs.getLong("elapsed_ms"),
                        round1(rs.getDouble("orders_per_second")),
                        round1(rs.getDouble("jobs_per_second")),
                        round1(rs.getDouble("p95_duration_ms")),
                        rs.getInt("failed_jobs"),
                        rs.getString("started_at"),
                        rs.getString("completed_at")
                )
        );
    }

    private void updateRunProgress(
            String runId,
            String runStatus,
            CollectStats collectStats,
            NormalizeStats normalizeStats,
            MockMallLoadTestStatusResponse.OutboxStatus outboxStatus,
            int normalizedOrders,
            long elapsedMs,
            RateStats rates,
            DurationStats durationStats,
            boolean completed
    ) {
        jdbcTemplate.update(
                """
                        UPDATE hub_load_test_run
                        SET status = ?,
                            total_jobs = ?,
                            total_collect_jobs = ?,
                            total_normalize_jobs = ?,
                            completed_jobs = ?,
                            completed_normalize_jobs = ?,
                            success_jobs = ?,
                            failed_jobs = ?,
                            normalized_orders = ?,
                            elapsed_ms = ?,
                            orders_per_second = ?,
                            jobs_per_second = ?,
                            throughput_per_minute = ?,
                            avg_duration_ms = ?,
                            p50_duration_ms = ?,
                            p95_duration_ms = ?,
                            max_duration_ms = ?,
                            outbox_total = ?,
                            outbox_pending = ?,
                            outbox_publishing = ?,
                            outbox_sent = ?,
                            outbox_failed = ?,
                            completed_at = CASE
                                WHEN ? = TRUE AND completed_at IS NULL THEN NOW()
                                WHEN ? = FALSE THEN NULL
                                ELSE completed_at
                            END,
                            updated_at = NOW()
                        WHERE run_id = ?
                        """,
                runStatus,
                collectStats.total(),
                collectStats.total(),
                normalizeStats.total(),
                collectStats.success() + collectStats.failed(),
                normalizeStats.success() + normalizeStats.failed(),
                collectStats.success() + normalizeStats.success(),
                collectStats.failed() + normalizeStats.failed(),
                normalizedOrders,
                elapsedMs,
                rates.ordersPerSecond(),
                rates.jobsPerSecond(),
                rates.throughputPerMinute(),
                durationStats.avgMs(),
                durationStats.p50Ms(),
                durationStats.p95Ms(),
                durationStats.maxMs(),
                outboxStatus.total(),
                outboxStatus.pending(),
                outboxStatus.publishing(),
                outboxStatus.sent(),
                outboxStatus.failed(),
                completed,
                completed,
                runId
        );
    }

    private boolean isCompleted(CollectStats collectStats, NormalizeStats normalizeStats) {
        if (collectStats.total() == 0) {
            return false;
        }
        int completedCollect = collectStats.success() + collectStats.failed();
        int completedNormalize = normalizeStats.success() + normalizeStats.failed();
        return completedCollect >= collectStats.total()
                && normalizeStats.total() >= collectStats.success()
                && completedNormalize >= normalizeStats.total();
    }

    private long elapsedMs(RunRecord run, boolean completed) {
        Instant end = completed && run.completedAt() != null ? run.completedAt() : Instant.now();
        return Math.max(0, end.toEpochMilli() - run.startedAt().toEpochMilli());
    }

    private RateStats rateStats(long elapsedMs, int normalizedOrders, CollectStats collectStats, NormalizeStats normalizeStats) {
        double seconds = elapsedMs <= 0 ? 0 : elapsedMs / 1000.0;
        int completedJobs = collectStats.success() + collectStats.failed() + normalizeStats.success() + normalizeStats.failed();
        double ordersPerSecond = seconds <= 0 ? 0 : normalizedOrders / seconds;
        double jobsPerSecond = seconds <= 0 ? 0 : completedJobs / seconds;
        double throughputPerMinute = jobsPerSecond * 60.0;
        return new RateStats(round1(ordersPerSecond), round1(jobsPerSecond), round1(throughputPerMinute));
    }

    private Instant toInstant(Timestamp timestamp) {
        if (timestamp == null) {
            return null;
        }
        return timestamp.toInstant();
    }

    private double round1(double value) {
        if (!Double.isFinite(value)) {
            return 0;
        }
        return Math.round(value * 10.0) / 10.0;
    }

    private int positive(Integer value, int fallback) {
        return value != null && value > 0 ? value : fallback;
    }

    private int nonNegative(Integer value, int fallback) {
        return value != null && value >= 0 ? value : fallback;
    }

    private double rate(Double value) {
        if (value == null || !Double.isFinite(value)) {
            return 0;
        }
        return Math.max(0, Math.min(value, 1));
    }

    private String textOrDefault(String value, String fallback) {
        return value == null || value.isBlank() ? fallback : value.trim();
    }

    private record RunRecord(String runId, String scenario, String status, Instant startedAt, Instant completedAt) {
    }

    private record CollectStats(int total, int queued, int processing, int success, int failed) {
    }

    private record NormalizeStats(int total, int success, int failed) {
    }

    private record DurationStats(double avgMs, double p50Ms, double p95Ms, double maxMs) {
    }

    private record RateStats(double ordersPerSecond, double jobsPerSecond, double throughputPerMinute) {
    }
}
