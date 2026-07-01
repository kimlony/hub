package hub.kafka.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import hub.kafka.dto.request.KafkaDlqReplayRequest;
import hub.kafka.dto.response.KafkaDlqMessageItem;
import hub.kafka.dto.response.KafkaDlqMessageResponse;
import hub.kafka.dto.response.KafkaDlqReplayResponse;
import hub.kafka.dto.response.KafkaJobDistributionItem;
import hub.kafka.dto.response.KafkaJobDistributionResponse;
import hub.kafka.dto.response.KafkaJobDistributionSummary;
import hub.kafka.dto.response.KafkaMonitorResponse;
import hub.kafka.dto.response.KafkaMonitorStats;
import hub.kafka.KafkaBrokerInfo;
import hub.kafka.KafkaPartitionInfo;
import hub.kafka.KafkaTopicInfo;
import hub.job.domain.HubJob;
import hub.job.domain.HubJobStatus;
import hub.job.event.HubJobEvent;
import hub.job.mapper.HubJobMapper;
import hub.job.service.JobPayloadValidator;
import hub.outbox.service.JobOutboxService;
import java.time.format.DateTimeFormatter;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collection;
import java.util.Comparator;
import java.util.concurrent.TimeUnit;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Properties;
import java.util.Set;
import java.util.stream.Collectors;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.apache.kafka.clients.admin.AdminClient;
import org.apache.kafka.clients.admin.ConsumerGroupDescription;
import org.apache.kafka.clients.admin.DescribeClusterResult;
import org.apache.kafka.clients.admin.DescribeConsumerGroupsResult;
import org.apache.kafka.clients.admin.DescribeTopicsResult;
import org.apache.kafka.clients.admin.ListConsumerGroupOffsetsResult;
import org.apache.kafka.clients.admin.ListOffsetsResult;
import org.apache.kafka.clients.admin.ListTopicsOptions;
import org.apache.kafka.clients.admin.MemberDescription;
import org.apache.kafka.clients.admin.OffsetSpec;
import org.apache.kafka.clients.admin.TopicDescription;
import org.apache.kafka.clients.consumer.ConsumerConfig;
import org.apache.kafka.clients.consumer.ConsumerRecord;
import org.apache.kafka.clients.consumer.ConsumerRecords;
import org.apache.kafka.clients.consumer.KafkaConsumer;
import org.apache.kafka.clients.consumer.OffsetAndMetadata;
import org.apache.kafka.common.Node;
import org.apache.kafka.common.serialization.StringDeserializer;
import org.apache.kafka.common.TopicPartition;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.kafka.core.KafkaAdmin;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class KafkaMonitorService {

    private static final long ADMIN_TIMEOUT_SECONDS = 5;
    private static final int MAX_DLQ_LIMIT = 100;
    private static final ZoneId SEOUL_ZONE = ZoneId.of("Asia/Seoul");
    private static final DateTimeFormatter DATE_TIME_FORMATTER = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");

    private final KafkaAdmin kafkaAdmin;
    private final JdbcTemplate jdbcTemplate;
    private final ObjectMapper objectMapper;
    private final HubJobMapper hubJobMapper;
    private final JobOutboxService jobOutboxService;
    private final JobPayloadValidator jobPayloadValidator;

    @Value("${hub.kafka.topics.jobs}")
    private String jobsTopic;

    @Value("${hub.kafka.topics.dlq:hub.jobs.dlq}")
    private String dlqTopic;

    @Value("${hub.kafka.consumer-group:hub-worker-group}")
    private String consumerGroup;

    public KafkaMonitorResponse getMonitor() {
        try (AdminClient adminClient = AdminClient.create(adminProperties())) {
            List<KafkaBrokerInfo> brokers = fetchBrokers(adminClient);
            List<KafkaTopicInfo> topics = fetchTopics(adminClient, monitorTopicNames());
            long totalLag = topics.stream().mapToLong(KafkaTopicInfo::lag).sum();
            int partitionCount = topics.stream().mapToInt(KafkaTopicInfo::partitions).sum();
            boolean hasWarning = topics.stream()
                    .anyMatch(topic -> "WARN".equals(topic.status()) || "MISSING".equals(topic.status()));

            return new KafkaMonitorResponse(
                    new KafkaMonitorStats(topics.size(), brokers.size(), partitionCount, totalLag),
                    topics,
                    brokers,
                    consumerGroup,
                    hasWarning ? "WARN" : "HEALTHY",
                    null,
                    LocalDateTime.now()
            );
        } catch (Exception exception) {
            return new KafkaMonitorResponse(
                    new KafkaMonitorStats(0, 0, 0, 0L),
                    List.of(),
                    List.of(),
                    consumerGroup,
                    "ERROR",
                    exception.getMessage(),
                    LocalDateTime.now()
            );
        }
    }

    public KafkaJobDistributionResponse getJobDistribution(int minutes, int page, int size) {
        int safeMinutes = Math.max(1, Math.min(minutes, 24 * 60));
        int safePage = Math.max(1, page);
        int safeSize = Math.max(1, Math.min(size, 50));
        return new KafkaJobDistributionResponse(
                safeMinutes,
                fetchJobDistributionSummary(safeMinutes),
                fetchRecentKafkaJobs(safeMinutes, safePage, safeSize),
                safePage,
                safeSize,
                countRecentKafkaJobs(safeMinutes),
                LocalDateTime.now()
        );
    }

    public KafkaDlqMessageResponse getDlqMessages(int limit) {
        int safeLimit = Math.max(1, Math.min(limit, MAX_DLQ_LIMIT));
        if (dlqTopic == null || dlqTopic.isBlank()) {
            return new KafkaDlqMessageResponse(
                    dlqTopic,
                    0,
                    List.of(),
                    "ERROR",
                    "DLQ topic is not configured",
                    LocalDateTime.now()
            );
        }

        try (AdminClient adminClient = AdminClient.create(adminProperties());
             KafkaConsumer<String, String> consumer = new KafkaConsumer<>(dlqConsumerProperties())) {
            // Read DLQ directly from Kafka instead of the job table so operators
            // can inspect the exact failed message that would be replayed later.
            if (!topicExists(adminClient, dlqTopic)) {
                return new KafkaDlqMessageResponse(dlqTopic, 0, List.of(), "HEALTHY", null, LocalDateTime.now());
            }

            TopicDescription description = adminClient.describeTopics(List.of(dlqTopic))
                    .allTopicNames()
                    .get(ADMIN_TIMEOUT_SECONDS, TimeUnit.SECONDS)
                    .get(dlqTopic);
            List<TopicPartition> partitions = description.partitions().stream()
                    .map(partition -> new TopicPartition(dlqTopic, partition.partition()))
                    .toList();

            if (partitions.isEmpty()) {
                return new KafkaDlqMessageResponse(dlqTopic, 0, List.of(), "HEALTHY", null, LocalDateTime.now());
            }

            Map<TopicPartition, Long> latestOffsets = fetchLatestOffsets(adminClient, List.of(description));
            consumer.assign(partitions);
            for (TopicPartition partition : partitions) {
                long latestOffset = latestOffsets.getOrDefault(partition, 0L);
                consumer.seek(partition, Math.max(0L, latestOffset - safeLimit));
            }

            List<KafkaDlqMessageItem> messages = new ArrayList<>();
            long deadline = System.currentTimeMillis() + 2_000L;
            while (System.currentTimeMillis() < deadline && messages.size() < safeLimit * partitions.size()) {
                ConsumerRecords<String, String> records = consumer.poll(java.time.Duration.ofMillis(250));
                if (records.isEmpty()) {
                    continue;
                }
                for (ConsumerRecord<String, String> record : records) {
                    messages.add(toDlqMessageItem(record));
                }
            }

            List<KafkaDlqMessageItem> recentMessages = messages.stream()
                    .sorted(Comparator.comparing(KafkaDlqMessageItem::createdAt).reversed()
                            .thenComparing(Comparator.comparingLong(KafkaDlqMessageItem::offset).reversed()))
                    .limit(safeLimit)
                    .toList();

            return new KafkaDlqMessageResponse(
                    dlqTopic,
                    recentMessages.size(),
                    recentMessages,
                    recentMessages.isEmpty() ? "HEALTHY" : "WARN",
                    null,
                    LocalDateTime.now()
            );
        } catch (Exception exception) {
            return new KafkaDlqMessageResponse(
                    dlqTopic,
                    0,
                    List.of(),
                    "ERROR",
                    exception.getMessage(),
                    LocalDateTime.now()
            );
        }
    }

    @Transactional
    public KafkaDlqReplayResponse replayDlqMessage(KafkaDlqReplayRequest request) {
        if (request == null || request.rawMessage() == null || request.rawMessage().isBlank()) {
            throw new IllegalArgumentException("rawMessage is required");
        }

        try {
            JsonNode root = objectMapper.readTree(request.rawMessage());
            JsonNode job = root.path("job");
            if (job.isMissingNode() || job.isNull()) {
                throw new IllegalArgumentException("DLQ message does not contain job payload");
            }

            String requestId = text(job, "requestId");
            if (requestId.isBlank()) {
                throw new IllegalArgumentException("DLQ job requestId is required");
            }

            HubJob storedJob = hubJobMapper.selectByRequestId(requestId);
            if (storedJob == null || storedJob.getStatus() != HubJobStatus.FAILED) {
                throw new IllegalStateException("DLQ replay requires a FAILED hub_job: " + requestId);
            }
            String dlqJobType = text(job, "jobType");
            if (!dlqJobType.isBlank() && !storedJob.getJobType().equals(dlqJobType)) {
                throw new IllegalArgumentException("DLQ jobType does not match stored job: " + requestId);
            }

            Map<String, Object> originalPayload = jobPayloadValidator.validate(storedJob);
            String partitionKey = jobOutboxService.findLatestPartitionKey(requestId);
            HubJobEvent replayEvent = new HubJobEvent(
                    storedJob.getRequestId(),
                    storedJob.getSourceErp(),
                    storedJob.getJobType(),
                    storedJob.getRequestKey(),
                    storedJob.getParentJobId(),
                    storedJob.getCorrelationId(),
                    storedJob.getCausationId(),
                    storedJob.getSchemaVersion(),
                    storedJob.getPayloadVersion(),
                    originalPayload
            );

            int updated = hubJobMapper.resetFailedJobForRetry(
                    storedJob.getRequestKey(), storedJob.getPayload());

            if (updated != 1) {
                throw new IllegalStateException("DLQ replay requires a FAILED hub_job: " + requestId);
            }
            if (partitionKey == null || partitionKey.isBlank()) {
                partitionKey = jobOutboxService.resolvePartitionKey(replayEvent);
                jobOutboxService.enqueue(replayEvent);
            } else {
                jobOutboxService.enqueue(replayEvent, partitionKey);
            }

            jdbcTemplate.update(
                    """
                            INSERT INTO hub_job_log (
                                request_id,
                                event_type,
                                level,
                                message,
                                job_type,
                                source_erp,
                                request_key,
                                channel_cd,
                                mall_key,
                                detail
                            ) VALUES (
                                ?, 'JOB_DLQ_REPLAY_QUEUED', 'INFO', 'DLQ replay queued through outbox',
                                ?, ?, ?, ?, ?, ?::jsonb
                            )
                            """,
                    requestId,
                    storedJob.getJobType(),
                    storedJob.getSourceErp(),
                    storedJob.getRequestKey(),
                    text(objectMapper.valueToTree(originalPayload), "channelCd"),
                    text(objectMapper.valueToTree(originalPayload), "mallKey"),
                    objectMapper.writeValueAsString(Map.of(
                            "topic", jobsTopic,
                            "partitionKey", partitionKey,
                            "failedAt", text(root, "failedAt"),
                            "source", text(root, "source"),
                            "errorMessage", text(root, "errorMessage")
                    ))
            );

            return new KafkaDlqReplayResponse(
                    requestId,
                    jobsTopic,
                    partitionKey,
                    "QUEUED",
                    LocalDateTime.now()
            );
        } catch (IllegalArgumentException | IllegalStateException exception) {
            throw exception;
        } catch (Exception exception) {
            throw new IllegalStateException("failed to replay DLQ message", exception);
        }
    }

    private List<KafkaJobDistributionSummary> fetchJobDistributionSummary(int minutes) {
        return jdbcTemplate.query(
                """
                        SELECT
                            NULLIF(detail #>> '{kafka,partition}', '')::int AS partition_no,
                            COUNT(*)::bigint AS job_count,
                            STRING_AGG(DISTINCT COALESCE(detail ->> 'workerInstanceId', ''), ',') AS worker_instance_ids,
                            STRING_AGG(DISTINCT COALESCE(detail ->> 'kafkaClientId', ''), ',') AS kafka_client_ids,
                            STRING_AGG(DISTINCT COALESCE(channel_cd, ''), ',') AS channels
                        FROM hub_job_log
                        WHERE event_type = 'JOB_RECEIVED_FROM_KAFKA'
                          AND created_at >= NOW() - (? * INTERVAL '1 minute')
                          AND detail #>> '{kafka,partition}' IS NOT NULL
                        GROUP BY partition_no
                        ORDER BY partition_no
                        """,
                (rs, rowNum) -> new KafkaJobDistributionSummary(
                        rs.getInt("partition_no"),
                        rs.getLong("job_count"),
                        splitCsv(rs.getString("worker_instance_ids")),
                        splitCsv(rs.getString("kafka_client_ids")),
                        splitCsv(rs.getString("channels"))
                ),
                minutes
        );
    }

    private List<KafkaJobDistributionItem> fetchRecentKafkaJobs(int minutes, int page, int size) {
        int offset = (page - 1) * size;
        return jdbcTemplate.query(
                """
                        SELECT
                            request_id,
                            channel_cd,
                            NULLIF(detail #>> '{kafka,partition}', '')::int AS partition_no,
                            detail #>> '{kafka,offset}' AS offset_no,
                            detail #>> '{kafka,messageKey}' AS message_key,
                            detail #>> '{kafka,kafkaMessageId}' AS kafka_message_id,
                            detail ->> 'workerInstanceId' AS worker_instance_id,
                            detail ->> 'kafkaClientId' AS kafka_client_id,
                            to_char(created_at AT TIME ZONE 'Asia/Seoul', 'YYYY-MM-DD HH24:MI:SS') AS created_at
                        FROM hub_job_log
                        WHERE event_type = 'JOB_RECEIVED_FROM_KAFKA'
                          AND created_at >= NOW() - (? * INTERVAL '1 minute')
                          AND detail #>> '{kafka,partition}' IS NOT NULL
                        ORDER BY created_at DESC, id DESC
                        LIMIT ? OFFSET ?
                        """,
                (rs, rowNum) -> new KafkaJobDistributionItem(
                        rs.getString("request_id"),
                        rs.getString("channel_cd"),
                        rs.getInt("partition_no"),
                        rs.getString("offset_no"),
                        rs.getString("message_key"),
                        rs.getString("kafka_message_id"),
                        rs.getString("worker_instance_id"),
                        rs.getString("kafka_client_id"),
                        rs.getString("created_at")
                ),
                minutes,
                size,
                offset
        );
    }

    private long countRecentKafkaJobs(int minutes) {
        Long count = jdbcTemplate.queryForObject(
                """
                        SELECT COUNT(*)::bigint
                        FROM hub_job_log
                        WHERE event_type = 'JOB_RECEIVED_FROM_KAFKA'
                          AND created_at >= NOW() - (? * INTERVAL '1 minute')
                          AND detail #>> '{kafka,partition}' IS NOT NULL
                        """,
                Long.class,
                minutes
        );
        return count == null ? 0L : count;
    }

    private List<String> splitCsv(String value) {
        if (value == null || value.isBlank()) {
            return List.of();
        }
        return Arrays.stream(value.split(","))
                .map(String::trim)
                .filter(item -> !item.isBlank())
                .distinct()
                .toList();
    }

    private Properties adminProperties() {
        Properties properties = new Properties();
        properties.putAll(kafkaAdmin.getConfigurationProperties());
        return properties;
    }

    private Properties dlqConsumerProperties() {
        Properties properties = adminProperties();
        properties.put(ConsumerConfig.GROUP_ID_CONFIG, "hub-dlq-viewer-" + UUID.randomUUID());
        properties.put(ConsumerConfig.ENABLE_AUTO_COMMIT_CONFIG, "false");
        properties.put(ConsumerConfig.AUTO_OFFSET_RESET_CONFIG, "earliest");
        properties.put(ConsumerConfig.KEY_DESERIALIZER_CLASS_CONFIG, StringDeserializer.class.getName());
        properties.put(ConsumerConfig.VALUE_DESERIALIZER_CLASS_CONFIG, StringDeserializer.class.getName());
        return properties;
    }

    private List<String> monitorTopicNames() {
        return List.of(jobsTopic, dlqTopic).stream()
                .filter(topic -> topic != null && !topic.isBlank())
                .distinct()
                .toList();
    }

    private List<KafkaBrokerInfo> fetchBrokers(AdminClient adminClient) throws Exception {
        DescribeClusterResult cluster = adminClient.describeCluster();
        Collection<Node> nodes = cluster.nodes().get(ADMIN_TIMEOUT_SECONDS, TimeUnit.SECONDS);

        return nodes.stream()
                .sorted(Comparator.comparingInt(Node::id))
                .map(node -> new KafkaBrokerInfo(
                        node.id(),
                        node.host(),
                        node.port(),
                        node.rack(),
                        "ONLINE"
                ))
                .collect(Collectors.toList());
    }

    private List<KafkaTopicInfo> fetchTopics(AdminClient adminClient, List<String> topicNames) throws Exception {
        if (topicNames.isEmpty()) {
            return List.of();
        }

        Set<String> existingTopics = existingTopics(adminClient);
        List<String> existingTopicNames = topicNames.stream()
                .filter(existingTopics::contains)
                .toList();

        if (existingTopicNames.isEmpty()) {
            return topicNames.stream()
                    .map(topic -> new KafkaTopicInfo(topic, 0, 0, 0L, "MISSING", List.of()))
                    .sorted(Comparator.comparing(KafkaTopicInfo::name))
                    .toList();
        }

        DescribeTopicsResult describeTopics = adminClient.describeTopics(existingTopicNames);
        Map<String, TopicDescription> descriptions = describeTopics.allTopicNames()
                .get(ADMIN_TIMEOUT_SECONDS, TimeUnit.SECONDS);
        Map<TopicPartition, Long> committedOffsets = fetchCommittedOffsets(adminClient);
        Map<TopicPartition, Long> latestOffsets = fetchLatestOffsets(adminClient, descriptions.values());
        Map<TopicPartition, MemberDescription> partitionMembers = fetchPartitionMembers(adminClient);

        List<KafkaTopicInfo> topics = new ArrayList<>();
        for (TopicDescription description : descriptions.values()) {
            long topicLag = 0L;
            long topicLatestOffset = 0L;
            int replicaCount = 0;
            List<KafkaPartitionInfo> partitionDetails = new ArrayList<>();
            boolean dlqStorageTopic = description.name().equals(dlqTopic);

            for (var partition : description.partitions()) {
                TopicPartition topicPartition = new TopicPartition(description.name(), partition.partition());
                long latestOffset = latestOffsets.getOrDefault(topicPartition, 0L);
                long committedOffset = dlqStorageTopic
                        ? latestOffset
                        : committedOffsets.getOrDefault(topicPartition, 0L);
                long lag = dlqStorageTopic ? 0L : Math.max(0L, latestOffset - committedOffset);
                MemberDescription member = partitionMembers.get(topicPartition);

                topicLag += lag;
                topicLatestOffset += latestOffset;
                replicaCount = Math.max(replicaCount, partition.replicas().size());
                partitionDetails.add(new KafkaPartitionInfo(
                        description.name(),
                        partition.partition(),
                        partition.leader().id(),
                        partition.replicas().stream().map(Node::id).toList(),
                        latestOffset,
                        committedOffset,
                        lag,
                        member != null ? member.consumerId() : null,
                        member != null ? member.clientId() : null,
                        member != null ? member.host() : null,
                        (dlqStorageTopic ? latestOffset > 0 : lag > 0) ? "WARN" : "HEALTHY"
                ));
            }

            topics.add(new KafkaTopicInfo(
                    description.name(),
                    description.partitions().size(),
                    replicaCount,
                    topicLag,
                    (dlqStorageTopic ? topicLatestOffset > 0 : topicLag > 0) ? "WARN" : "HEALTHY",
                    partitionDetails.stream()
                            .sorted(Comparator.comparingInt(KafkaPartitionInfo::partition))
                            .toList()
                    ));
        }

        topicNames.stream()
                .filter(topic -> !existingTopics.contains(topic))
                .map(topic -> new KafkaTopicInfo(topic, 0, 0, 0L, "MISSING", List.of()))
                .forEach(topics::add);

        topics.sort(Comparator.comparing(KafkaTopicInfo::name));
        return topics;
    }

    private boolean topicExists(AdminClient adminClient, String topicName) throws Exception {
        return existingTopics(adminClient).contains(topicName);
    }

    private Set<String> existingTopics(AdminClient adminClient) throws Exception {
        return adminClient.listTopics(new ListTopicsOptions().listInternal(false))
                .names()
                .get(ADMIN_TIMEOUT_SECONDS, TimeUnit.SECONDS);
    }

    private Map<TopicPartition, Long> fetchCommittedOffsets(AdminClient adminClient) throws Exception {
        ListConsumerGroupOffsetsResult offsetsResult = adminClient.listConsumerGroupOffsets(consumerGroup);
        Map<TopicPartition, OffsetAndMetadata> offsets = offsetsResult.partitionsToOffsetAndMetadata()
                .get(ADMIN_TIMEOUT_SECONDS, TimeUnit.SECONDS);

        Map<TopicPartition, Long> committedOffsets = new HashMap<>();
        offsets.forEach((partition, metadata) -> committedOffsets.put(partition, metadata.offset()));
        return committedOffsets;
    }

    private Map<TopicPartition, Long> fetchLatestOffsets(
            AdminClient adminClient,
            Collection<TopicDescription> descriptions
    ) throws Exception {
        Set<TopicPartition> partitions = descriptions.stream()
                .flatMap(topic -> topic.partitions().stream()
                        .map(partition -> new TopicPartition(topic.name(), partition.partition())))
                .collect(Collectors.toSet());

        Map<TopicPartition, OffsetSpec> offsetSpecs = partitions.stream()
                .collect(Collectors.toMap(partition -> partition, partition -> OffsetSpec.latest()));
        ListOffsetsResult latestOffsets = adminClient.listOffsets(offsetSpecs);
        Map<TopicPartition, ListOffsetsResult.ListOffsetsResultInfo> offsets = latestOffsets.all()
                .get(ADMIN_TIMEOUT_SECONDS, TimeUnit.SECONDS);

        Map<TopicPartition, Long> result = new HashMap<>();
        offsets.forEach((partition, info) -> result.put(partition, info.offset()));
        return result;
    }

    private Map<TopicPartition, MemberDescription> fetchPartitionMembers(AdminClient adminClient) {
        try {
            DescribeConsumerGroupsResult result = adminClient.describeConsumerGroups(List.of(consumerGroup));
            ConsumerGroupDescription group = result.describedGroups()
                    .get(consumerGroup)
                    .get(ADMIN_TIMEOUT_SECONDS, TimeUnit.SECONDS);

            Map<TopicPartition, MemberDescription> membersByPartition = new HashMap<>();
            for (MemberDescription member : group.members()) {
                for (TopicPartition partition : member.assignment().topicPartitions()) {
                    membersByPartition.put(partition, member);
                }
            }
            return membersByPartition;
        } catch (Exception exception) {
            return Map.of();
        }
    }

    private KafkaDlqMessageItem toDlqMessageItem(ConsumerRecord<String, String> record) {
        JsonNode root = parseJson(record.value());
        JsonNode job = root.path("job");
        JsonNode payload = job.path("payload");

        return new KafkaDlqMessageItem(
                record.key(),
                record.partition(),
                record.offset(),
                formatEpochMillis(record.timestamp()),
                text(root, "failedAt"),
                text(root, "source"),
                text(root, "errorMessage"),
                intValue(root, "retryCount"),
                intValue(root, "maxRetryCount"),
                text(job, "requestId"),
                text(job, "jobType"),
                text(job, "requestKey"),
                text(payload, "channelCd"),
                payload.isMissingNode() || payload.isNull() ? "" : payload.toString(),
                record.value()
        );
    }

    private JsonNode parseJson(String value) {
        try {
            return objectMapper.readTree(value);
        } catch (Exception exception) {
            return objectMapper.createObjectNode();
        }
    }

    private String text(JsonNode node, String fieldName) {
        JsonNode value = node.path(fieldName);
        return value.isMissingNode() || value.isNull() ? "" : value.asText();
    }

    private int intValue(JsonNode node, String fieldName) {
        JsonNode value = node.path(fieldName);
        return value.isNumber() ? value.asInt() : 0;
    }

    private String formatEpochMillis(long epochMillis) {
        return DATE_TIME_FORMATTER.format(Instant.ofEpochMilli(epochMillis).atZone(SEOUL_ZONE));
    }
}
