package com.bizbee.hub.notice;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.LocalDateTime;
import java.util.List;

@Slf4j
@Service
@RequiredArgsConstructor
public class ChannelNoticeServiceImpl implements ChannelNoticeService {

    private static final int FAILURE_THRESHOLD = 3;

    private final JdbcTemplate jdbcTemplate;

    @Override
    public ChannelNoticeResponse getActiveNotices() {
        return new ChannelNoticeResponse(selectOpenNotices(), LocalDateTime.now());
    }

    @Scheduled(fixedDelayString = "${hub.notice.scan-ms:300000}", initialDelayString = "${hub.notice.initial-delay-ms:30000}")
    @Override
    public void scanExternalChannelIssues() {
        List<ChannelFailureCandidate> candidates = selectFailureCandidates();
        for (ChannelFailureCandidate candidate : candidates) {
            upsertOpenNotice(candidate);
        }
        resolveRecoveredNotices();
    }

    private List<ChannelFailureCandidate> selectFailureCandidates() {
        return jdbcTemplate.query(
                """
                        SELECT
                            channel_cd,
                            COUNT(*)::int AS failure_count,
                            MIN(created_at) AS first_detected_at,
                            MAX(updated_at) AS last_detected_at,
                            STRING_AGG(DISTINCT COALESCE(error_message, ''), ' | ') AS reason
                        FROM hub_job
                        WHERE status = 'FAILED'
                          AND updated_at >= NOW() - INTERVAL '30 minutes'
                          AND error_message IS NOT NULL
                          AND NOT (
                              lower(error_message) LIKE '%credential%'
                              OR lower(error_message) LIKE '%not active%'
                              OR lower(error_message) LIKE '%unsupported%'
                              OR lower(error_message) LIKE '%required%'
                              OR lower(error_message) LIKE '%hub_aes_secret%'
                              OR error_message LIKE '%인증키%'
                          )
                        GROUP BY channel_cd
                        HAVING COUNT(*) >= ?
                        """,
                (rs, rowNum) -> new ChannelFailureCandidate(
                        rs.getString("channel_cd"),
                        rs.getInt("failure_count"),
                        rs.getString("reason")
                ),
                FAILURE_THRESHOLD
        );
    }

    private void upsertOpenNotice(ChannelFailureCandidate candidate) {
        String title = candidate.channelCd() + " 주문수집 지연 안내";
        String message = "현재 " + candidate.channelCd()
                + " 몰의 주문수집 기능이 원활하지 않습니다. 외부 쇼핑몰 API 응답 문제로 추정되며, 잠시 후 자동 재시도됩니다.";

        jdbcTemplate.update(
                """
                        INSERT INTO hub_channel_notice (
                            channel_cd,
                            severity,
                            status,
                            title,
                            message,
                            reason,
                            failure_count,
                            first_detected_at,
                            last_detected_at
                        ) VALUES (
                            ?, 'WARN', 'OPEN', ?, ?, ?, ?, NOW(), NOW()
                        )
                        ON CONFLICT (channel_cd) WHERE status = 'OPEN'
                        DO UPDATE
                        SET severity = EXCLUDED.severity,
                            title = EXCLUDED.title,
                            message = EXCLUDED.message,
                            reason = EXCLUDED.reason,
                            failure_count = EXCLUDED.failure_count,
                            last_detected_at = NOW(),
                            updated_at = NOW()
                        """,
                candidate.channelCd(),
                title,
                message,
                candidate.reason(),
                candidate.failureCount()
        );
        log.warn("channel notice opened or updated: channel={}, failures={}",
                candidate.channelCd(), candidate.failureCount());
    }

    private void resolveRecoveredNotices() {
        jdbcTemplate.update(
                """
                        UPDATE hub_channel_notice notice
                        SET status = 'RESOLVED',
                            resolved_at = NOW(),
                            updated_at = NOW()
                        WHERE notice.status = 'OPEN'
                          AND EXISTS (
                              SELECT 1
                              FROM hub_job job
                              WHERE job.channel_cd = notice.channel_cd
                                AND job.status = 'SUCCESS'
                                AND job.updated_at > notice.last_detected_at
                          )
                        """
        );
    }

    private List<ChannelNotice> selectOpenNotices() {
        return jdbcTemplate.query(
                """
                        SELECT
                            id,
                            channel_cd,
                            severity,
                            status,
                            title,
                            message,
                            reason,
                            failure_count,
                            to_char(first_detected_at AT TIME ZONE 'Asia/Seoul', 'YYYY-MM-DD HH24:MI:SS') AS first_detected_at,
                            to_char(last_detected_at AT TIME ZONE 'Asia/Seoul', 'YYYY-MM-DD HH24:MI:SS') AS last_detected_at,
                            to_char(resolved_at AT TIME ZONE 'Asia/Seoul', 'YYYY-MM-DD HH24:MI:SS') AS resolved_at,
                            to_char(created_at AT TIME ZONE 'Asia/Seoul', 'YYYY-MM-DD HH24:MI:SS') AS created_at,
                            to_char(updated_at AT TIME ZONE 'Asia/Seoul', 'YYYY-MM-DD HH24:MI:SS') AS updated_at
                        FROM hub_channel_notice
                        WHERE status = 'OPEN'
                        ORDER BY severity DESC, updated_at DESC
                        """,
                new ChannelNoticeRowMapper()
        );
    }

    private record ChannelFailureCandidate(String channelCd, int failureCount, String reason) {
    }

    private static class ChannelNoticeRowMapper implements RowMapper<ChannelNotice> {
        @Override
        public ChannelNotice mapRow(ResultSet rs, int rowNum) throws SQLException {
            return new ChannelNotice(
                    rs.getLong("id"),
                    rs.getString("channel_cd"),
                    rs.getString("severity"),
                    rs.getString("status"),
                    rs.getString("title"),
                    rs.getString("message"),
                    rs.getString("reason"),
                    rs.getInt("failure_count"),
                    rs.getString("first_detected_at"),
                    rs.getString("last_detected_at"),
                    rs.getString("resolved_at"),
                    rs.getString("created_at"),
                    rs.getString("updated_at")
            );
        }
    }
}
