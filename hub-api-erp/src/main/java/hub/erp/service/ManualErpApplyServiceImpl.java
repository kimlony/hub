package hub.erp.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import hub.auth.AuthException;
import hub.auth.domain.HubUser;
import hub.auth.mapper.UserMapper;
import hub.erp.dto.request.ManualErpApplyRequest;
import hub.erp.dto.response.ErpConnectionItem;
import hub.erp.dto.response.ManualErpApplyCandidateItem;
import hub.erp.dto.response.ManualErpApplyCandidateResponse;
import hub.erp.dto.response.ManualErpApplyResponse;
import hub.job.domain.HubJob;
import hub.job.domain.HubJobStatus;
import hub.job.event.HubJobEvent;
import hub.job.mapper.HubJobMapper;
import hub.outbox.service.JobOutboxService;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
@Transactional
public class ManualErpApplyServiceImpl implements ManualErpApplyService {

    private final JdbcTemplate jdbcTemplate;
    private final UserMapper userMapper;
    private final HubJobMapper hubJobMapper;
    private final JobOutboxService jobOutboxService;
    private final ObjectMapper objectMapper;

    @Override
    @Transactional(readOnly = true)
    public List<ErpConnectionItem> getActiveConnections(String username) {
        HubUser user = findUser(username);
        return jdbcTemplate.query("""
                SELECT erp_connection_id, erp_type, auth_type
                FROM hub_erp_connection
                WHERE corp_id = ? AND is_active = TRUE
                ORDER BY erp_connection_id
                """, (rs, rowNum) -> new ErpConnectionItem(
                rs.getString("erp_connection_id"),
                rs.getString("erp_type"),
                rs.getString("auth_type")
        ), user.getCorpId());
    }

    @Override
    @Transactional(readOnly = true)
    public ManualErpApplyCandidateResponse getCandidates(
            String username,
            String erpConnectionId,
            String channelCd,
            String erpStatus,
            int page,
            int size
    ) {
        HubUser user = findUser(username);
        int safePage = Math.max(1, page);
        int safeSize = Math.max(1, Math.min(size, 200));
        int offset = (safePage - 1) * safeSize;
        String connection = trim(erpConnectionId);
        String channel = trim(channelCd);
        String status = trim(erpStatus).toUpperCase();

        String candidateCte = """
                WITH candidates AS (
                    SELECT
                        o.id AS normalized_order_id,
                        o.request_id AS source_normalize_job_id,
                        o.channel_account_id,
                        o.channel_cd,
                        o.channel_order_id AS order_no,
                        COALESCE(o.order_status, '') AS order_status,
                        to_char(o.order_date AT TIME ZONE 'Asia/Seoul', 'YYYY-MM-DD HH24:MI:SS') AS order_date,
                        COALESCE(r.status, 'NOT_APPLIED') AS erp_status,
                        r.erp_document_no,
                        r.error_code,
                        r.error_message
                    FROM hub_collected_order o
                    LEFT JOIN LATERAL (
                        SELECT status, erp_document_no, error_code, error_message
                        FROM hub_erp_apply_result ar
                        WHERE ar.normalized_order_id = o.id
                          AND (? = '' OR ar.erp_connection_id = ?)
                        ORDER BY ar.updated_at DESC, ar.id DESC
                        LIMIT 1
                    ) r ON TRUE
                    WHERE o.corp_id = ?
                      AND (? = '' OR o.channel_cd = ?)
                )
                """;
        Object[] baseParams = {connection, connection, user.getCorpId(), channel, channel};
        String statusFilter = status.isBlank() ? "" : " WHERE erp_status = ?";
        List<Object> params = new ArrayList<>(List.of(baseParams));
        if (!status.isBlank()) params.add(status);

        Long total = jdbcTemplate.queryForObject(
                candidateCte + "SELECT COUNT(*) FROM candidates" + statusFilter,
                Long.class,
                params.toArray()
        );
        List<Object> listParams = new ArrayList<>(params);
        listParams.add(safeSize);
        listParams.add(offset);
        List<ManualErpApplyCandidateItem> candidates = jdbcTemplate.query(
                candidateCte + "SELECT * FROM candidates" + statusFilter
                        + " ORDER BY order_date DESC NULLS LAST, normalized_order_id DESC LIMIT ? OFFSET ?",
                (rs, rowNum) -> new ManualErpApplyCandidateItem(
                        rs.getLong("normalized_order_id"),
                        rs.getString("source_normalize_job_id"),
                        rs.getLong("channel_account_id"),
                        rs.getString("channel_cd"),
                        rs.getString("order_no"),
                        rs.getString("order_status"),
                        rs.getString("order_date"),
                        rs.getString("erp_status"),
                        rs.getString("erp_document_no"),
                        rs.getString("error_code"),
                        rs.getString("error_message")
                ),
                listParams.toArray()
        );
        return new ManualErpApplyCandidateResponse(candidates, total == null ? 0 : total, safePage, safeSize);
    }

    @Override
    public ManualErpApplyResponse requestApply(String username, ManualErpApplyRequest request) {
        HubUser user = findUser(username);
        ManualErpApplyResponse existing = findExistingResponse(user.getCorpId(), request.clientRequestId());
        if (existing != null) return existing;

        String operation = trim(request.operation()).isBlank() ? "CREATE" : trim(request.operation()).toUpperCase();
        if (!"CREATE".equals(operation)) {
            throw new IllegalArgumentException("only CREATE operation is supported");
        }
        ensureActiveConnection(user.getCorpId(), request.erpConnectionId());

        List<Long> requestedIds = request.normalizedOrderIds().stream()
                .filter(java.util.Objects::nonNull)
                .distinct()
                .sorted()
                .toList();
        if (requestedIds.isEmpty()) throw new IllegalArgumentException("normalizedOrderIds is required");

        List<OrderRow> orders = findOrders(user.getCorpId(), requestedIds);
        if (orders.size() != requestedIds.size()) {
            throw new IllegalArgumentException("one or more normalized orders were not found for the current tenant");
        }

        Set<Long> skipped = new LinkedHashSet<>();
        skipped.addAll(findAppliedOrderIds(request.erpConnectionId(), operation, requestedIds));
        skipped.addAll(findInFlightOrderIds(request.erpConnectionId(), operation, requestedIds));
        List<OrderRow> acceptedOrders = orders.stream()
                .filter(order -> !skipped.contains(order.normalizedOrderId()))
                .toList();

        String commandId = UUID.randomUUID().toString();
        String requestJson = toJson(Map.of(
                "erpConnectionId", request.erpConnectionId(),
                "normalizedOrderIds", requestedIds,
                "operation", operation,
                "reason", request.reason() == null ? "" : request.reason()
        ));
        int inserted = jdbcTemplate.update("""
                INSERT INTO hub_erp_apply_command (
                    command_id, corp_id, user_id, client_request_id, erp_connection_id,
                    operation, reason, status, requested_count, accepted_count, skipped_count,
                    request_payload, skipped_order_ids, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, 'CREATING', ?, 0, 0, CAST(? AS jsonb), CAST(? AS jsonb), NOW(), NOW())
                ON CONFLICT (corp_id, client_request_id) DO NOTHING
                """,
                commandId, user.getCorpId(), user.getId(), request.clientRequestId(), request.erpConnectionId(),
                operation, request.reason(), requestedIds.size(), requestJson, toJson(skipped)
        );
        if (inserted == 0) {
            ManualErpApplyResponse concurrent = findExistingResponse(user.getCorpId(), request.clientRequestId());
            if (concurrent == null) throw new IllegalStateException("manual ERP command conflict could not be resolved");
            return concurrent;
        }

        List<ManualErpApplyResponse.JobItem> jobs = new ArrayList<>();
        Map<String, List<OrderRow>> groups = acceptedOrders.stream()
                .collect(Collectors.groupingBy(OrderRow::sourceNormalizeJobId, LinkedHashMap::new, Collectors.toList()));
        for (Map.Entry<String, List<OrderRow>> entry : groups.entrySet()) {
            jobs.add(createApplyJob(user, commandId, request.erpConnectionId(), operation, entry.getKey(), entry.getValue()));
        }

        String commandStatus = jobs.isEmpty() ? "NOOP" : "QUEUED";
        jdbcTemplate.update("""
                UPDATE hub_erp_apply_command
                SET status = ?, accepted_count = ?, skipped_count = ?, skipped_order_ids = CAST(? AS jsonb), updated_at = NOW()
                WHERE command_id = ?
                """, commandStatus, acceptedOrders.size(), skipped.size(), toJson(skipped), commandId);

        return new ManualErpApplyResponse(
                commandId,
                requestedIds.size(),
                acceptedOrders.size(),
                skipped.size(),
                commandStatus,
                List.copyOf(skipped),
                jobs
        );
    }

    private ManualErpApplyResponse.JobItem createApplyJob(
            HubUser user,
            String commandId,
            String erpConnectionId,
            String operation,
            String sourceNormalizeJobId,
            List<OrderRow> orders
    ) {
        OrderRow first = orders.get(0);
        List<Long> orderIds = orders.stream().map(OrderRow::normalizedOrderId).sorted().toList();
        String requestId = UUID.randomUUID().toString();
        String requestKey = "ERP_APPLY_MANUAL_" + commandId + "_" + sourceNormalizeJobId;
        String idempotencyKey = createIdempotencyKey(erpConnectionId, operation, orderIds);
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("sourceNormalizeJobId", sourceNormalizeJobId);
        payload.put("normalizedOrderIds", orderIds);
        payload.put("corpId", user.getCorpId());
        payload.put("userId", user.getId());
        payload.put("channelAccountId", first.channelAccountId());
        payload.put("channelCd", first.channelCd());
        payload.put("erpConnectionId", erpConnectionId);
        payload.put("operation", operation);
        payload.put("idempotencyKey", idempotencyKey);
        payload.put("triggerType", "MANUAL");
        payload.put("manualCommandId", commandId);

        HubJob job = HubJob.builder()
                .requestId(requestId)
                .requestKey(requestKey)
                .jobType("ERP_APPLY")
                .sourceErp("HUB")
                .parentJobId(sourceNormalizeJobId)
                .correlationId(first.correlationId())
                .causationId(commandId)
                .schemaVersion("1.0")
                .payloadVersion("1.0")
                .channelCd(first.channelCd())
                .status(HubJobStatus.QUEUED)
                .payload(toJson(payload))
                .retryCount(0)
                .build();
        if (hubJobMapper.insertJobIfAbsent(job) != 1) {
            throw new IllegalStateException("manual ERP apply job already exists: " + requestKey);
        }
        HubJobEvent event = new HubJobEvent(
                requestId, "HUB", "ERP_APPLY", requestKey,
                sourceNormalizeJobId, first.correlationId(), commandId,
                "1.0", "1.0", payload
        );
        jobOutboxService.enqueue(event);
        jdbcTemplate.update("""
                INSERT INTO hub_erp_apply_command_job (
                    command_id, job_request_id, source_normalize_job_id, order_count, created_at
                ) VALUES (?, ?, ?, ?, NOW())
                """, commandId, requestId, sourceNormalizeJobId, orderIds.size());
        return new ManualErpApplyResponse.JobItem(requestId, "ERP_APPLY", "QUEUED", sourceNormalizeJobId, orderIds.size());
    }

    private ManualErpApplyResponse findExistingResponse(Long corpId, String clientRequestId) {
        List<CommandRow> commands = jdbcTemplate.query("""
                SELECT command_id, requested_count, accepted_count, skipped_count, status, skipped_order_ids::text
                FROM hub_erp_apply_command
                WHERE corp_id = ? AND client_request_id = ?
                """, (rs, rowNum) -> new CommandRow(
                rs.getString("command_id"),
                rs.getInt("requested_count"),
                rs.getInt("accepted_count"),
                rs.getInt("skipped_count"),
                rs.getString("status"),
                parseLongList(rs.getString("skipped_order_ids"))
        ), corpId, clientRequestId);
        if (commands.isEmpty()) return null;
        CommandRow command = commands.get(0);
        List<ManualErpApplyResponse.JobItem> jobs = jdbcTemplate.query("""
                SELECT cj.job_request_id, cj.source_normalize_job_id, cj.order_count, j.job_type, j.status
                FROM hub_erp_apply_command_job cj
                JOIN hub_job j ON j.request_id = cj.job_request_id
                WHERE cj.command_id = ?
                ORDER BY cj.id
                """, (rs, rowNum) -> new ManualErpApplyResponse.JobItem(
                rs.getString("job_request_id"),
                rs.getString("job_type"),
                rs.getString("status"),
                rs.getString("source_normalize_job_id"),
                rs.getInt("order_count")
        ), command.commandId());
        return new ManualErpApplyResponse(
                command.commandId(), command.requested(), command.accepted(), command.skipped(),
                command.status(), command.skippedOrderIds(), jobs
        );
    }

    private void ensureActiveConnection(Long corpId, String erpConnectionId) {
        Long count = jdbcTemplate.queryForObject("""
                SELECT COUNT(*) FROM hub_erp_connection
                WHERE corp_id = ? AND erp_connection_id = ? AND is_active = TRUE
                """, Long.class, corpId, erpConnectionId);
        if (count == null || count != 1L) throw new IllegalArgumentException("active ERP connection was not found");
    }

    private List<OrderRow> findOrders(Long corpId, List<Long> ids) {
        String placeholders = placeholders(ids.size());
        List<Object> params = new ArrayList<>(ids);
        params.add(corpId);
        return jdbcTemplate.query("""
                SELECT o.id, o.request_id, o.channel_account_id, o.channel_cd, j.correlation_id
                FROM hub_collected_order o
                JOIN hub_job j ON j.request_id = o.request_id AND j.job_type = 'ORDER_NORMALIZE'
                WHERE o.id IN (%s) AND o.corp_id = ?
                ORDER BY o.id
                """.formatted(placeholders), (rs, rowNum) -> new OrderRow(
                rs.getLong("id"), rs.getString("request_id"), rs.getLong("channel_account_id"),
                rs.getString("channel_cd"), rs.getString("correlation_id")
        ), params.toArray());
    }

    private Set<Long> findAppliedOrderIds(String erpConnectionId, String operation, List<Long> ids) {
        String placeholders = placeholders(ids.size());
        List<Object> params = new ArrayList<>();
        params.add(erpConnectionId);
        params.add(operation);
        params.addAll(ids);
        return new LinkedHashSet<>(jdbcTemplate.queryForList("""
                SELECT DISTINCT normalized_order_id
                FROM hub_erp_apply_result
                WHERE erp_connection_id = ? AND operation = ? AND status = 'APPLIED'
                  AND normalized_order_id IN (%s)
                """.formatted(placeholders), Long.class, params.toArray()));
    }

    private Set<Long> findInFlightOrderIds(String erpConnectionId, String operation, List<Long> ids) {
        String placeholders = placeholders(ids.size());
        List<Object> params = new ArrayList<>();
        params.add(erpConnectionId);
        params.add(operation);
        params.addAll(ids);
        return new LinkedHashSet<>(jdbcTemplate.queryForList("""
                SELECT DISTINCT value::bigint
                FROM hub_job j
                CROSS JOIN LATERAL jsonb_array_elements_text(j.payload -> 'normalizedOrderIds') value
                WHERE j.job_type = 'ERP_APPLY'
                  AND j.status IN ('QUEUED', 'PROCESSING')
                  AND j.payload ->> 'erpConnectionId' = ?
                  AND j.payload ->> 'operation' = ?
                  AND value::bigint IN (%s)
                """.formatted(placeholders), Long.class, params.toArray()));
    }

    private HubUser findUser(String username) {
        return userMapper.findByUsername(username).orElseThrow(() -> new AuthException("user not found"));
    }

    private String placeholders(int size) {
        return java.util.stream.IntStream.range(0, size).mapToObj(index -> "?").collect(Collectors.joining(","));
    }

    private String trim(String value) {
        return value == null ? "" : value.trim();
    }

    private String toJson(Object value) {
        try {
            return objectMapper.writeValueAsString(value);
        } catch (JsonProcessingException exception) {
            throw new IllegalStateException("failed to serialize manual ERP payload", exception);
        }
    }

    private List<Long> parseLongList(String json) {
        if (json == null || json.isBlank()) return List.of();
        try {
            return objectMapper.readValue(json, new TypeReference<>() {});
        } catch (JsonProcessingException exception) {
            throw new IllegalStateException("failed to parse skipped order ids", exception);
        }
    }

    private String sha256(String value) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
                    .digest(value.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException("SHA-256 is unavailable", exception);
        }
    }

    private record OrderRow(long normalizedOrderId, String sourceNormalizeJobId, long channelAccountId,
                            String channelCd, String correlationId) {
    }

    private record CommandRow(String commandId, int requested, int accepted, int skipped,
                              String status, List<Long> skippedOrderIds) {
    }

    private String createIdempotencyKey(
            String erpConnectionId,
            String operation,
            List<Long> orderIds
    ) {
        String orderIdPart = orderIds.stream()
                .map(String::valueOf)
                .collect(Collectors.joining(","));

        return sha256(erpConnectionId + ":" + operation + ":" + orderIdPart);
    }
}