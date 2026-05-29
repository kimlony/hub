package com.bizbee.hub.kafka;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Comparator;
import java.util.Arrays;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Properties;
import java.util.Set;
import java.util.concurrent.TimeUnit;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import org.apache.kafka.clients.admin.AdminClient;
import org.apache.kafka.clients.admin.ConsumerGroupDescription;
import org.apache.kafka.clients.admin.DescribeClusterResult;
import org.apache.kafka.clients.admin.DescribeConsumerGroupsResult;
import org.apache.kafka.clients.admin.DescribeTopicsResult;
import org.apache.kafka.clients.admin.ListConsumerGroupOffsetsResult;
import org.apache.kafka.clients.admin.ListOffsetsResult;
import org.apache.kafka.clients.admin.MemberDescription;
import org.apache.kafka.clients.admin.OffsetSpec;
import org.apache.kafka.clients.admin.TopicDescription;
import org.apache.kafka.clients.consumer.OffsetAndMetadata;
import org.apache.kafka.common.Node;
import org.apache.kafka.common.TopicPartition;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.kafka.core.KafkaAdmin;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
public class KafkaMonitorService {

    private static final long ADMIN_TIMEOUT_SECONDS = 5;

    private final KafkaAdmin kafkaAdmin;
    private final JdbcTemplate jdbcTemplate;

    @Value("${hub.kafka.topics.jobs}")
    private String jobsTopic;

    @Value("${hub.kafka.consumer-group:hub-worker-group}")
    private String consumerGroup;

    public KafkaMonitorResponse getMonitor() {
        try (AdminClient adminClient = AdminClient.create(adminProperties())) {
            List<KafkaBrokerInfo> brokers = fetchBrokers(adminClient);
            List<KafkaTopicInfo> topics = fetchTopics(adminClient, List.of(jobsTopic));
            long totalLag = topics.stream().mapToLong(KafkaTopicInfo::lag).sum();
            int partitionCount = topics.stream().mapToInt(KafkaTopicInfo::partitions).sum();

            return new KafkaMonitorResponse(
                    new KafkaMonitorStats(topics.size(), brokers.size(), partitionCount, totalLag),
                    topics,
                    brokers,
                    consumerGroup,
                    totalLag > 0 ? "WARN" : "HEALTHY",
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

    public KafkaJobDistributionResponse getJobDistribution(int minutes) {
        int safeMinutes = Math.max(1, Math.min(minutes, 24 * 60));
        return new KafkaJobDistributionResponse(
                safeMinutes,
                fetchJobDistributionSummary(safeMinutes),
                fetchRecentKafkaJobs(safeMinutes),
                LocalDateTime.now()
        );
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

    private List<KafkaJobDistributionItem> fetchRecentKafkaJobs(int minutes) {
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
                        LIMIT 50
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
                minutes
        );
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
        DescribeTopicsResult describeTopics = adminClient.describeTopics(topicNames);
        Map<String, TopicDescription> descriptions = describeTopics.allTopicNames()
                .get(ADMIN_TIMEOUT_SECONDS, TimeUnit.SECONDS);
        Map<TopicPartition, Long> committedOffsets = fetchCommittedOffsets(adminClient);
        Map<TopicPartition, Long> latestOffsets = fetchLatestOffsets(adminClient, descriptions.values());
        Map<TopicPartition, MemberDescription> partitionMembers = fetchPartitionMembers(adminClient);

        List<KafkaTopicInfo> topics = new ArrayList<>();
        for (TopicDescription description : descriptions.values()) {
            long topicLag = 0L;
            int replicaCount = 0;
            List<KafkaPartitionInfo> partitionDetails = new ArrayList<>();

            for (var partition : description.partitions()) {
                TopicPartition topicPartition = new TopicPartition(description.name(), partition.partition());
                long latestOffset = latestOffsets.getOrDefault(topicPartition, 0L);
                long committedOffset = committedOffsets.getOrDefault(topicPartition, 0L);
                long lag = Math.max(0L, latestOffset - committedOffset);
                MemberDescription member = partitionMembers.get(topicPartition);

                topicLag += lag;
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
                        lag > 0 ? "WARN" : "HEALTHY"
                ));
            }

            topics.add(new KafkaTopicInfo(
                    description.name(),
                    description.partitions().size(),
                    replicaCount,
                    topicLag,
                    topicLag > 0 ? "WARN" : "HEALTHY",
                    partitionDetails.stream()
                            .sorted(Comparator.comparingInt(KafkaPartitionInfo::partition))
                            .toList()
            ));
        }

        topics.sort(Comparator.comparing(KafkaTopicInfo::name));
        return topics;
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
}
