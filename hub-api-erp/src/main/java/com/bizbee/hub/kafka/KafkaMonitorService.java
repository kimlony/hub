package com.bizbee.hub.kafka;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Properties;
import java.util.Set;
import java.util.concurrent.TimeUnit;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import org.apache.kafka.clients.admin.AdminClient;
import org.apache.kafka.clients.admin.DescribeClusterResult;
import org.apache.kafka.clients.admin.DescribeTopicsResult;
import org.apache.kafka.clients.admin.ListConsumerGroupOffsetsResult;
import org.apache.kafka.clients.admin.ListOffsetsResult;
import org.apache.kafka.clients.admin.OffsetSpec;
import org.apache.kafka.clients.admin.TopicDescription;
import org.apache.kafka.clients.consumer.OffsetAndMetadata;
import org.apache.kafka.common.Node;
import org.apache.kafka.common.TopicPartition;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.kafka.core.KafkaAdmin;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
public class KafkaMonitorService {

    private static final long ADMIN_TIMEOUT_SECONDS = 5;

    private final KafkaAdmin kafkaAdmin;

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

        List<KafkaTopicInfo> topics = new ArrayList<>();
        for (TopicDescription description : descriptions.values()) {
            long topicLag = 0L;
            int replicaCount = 0;

            for (var partition : description.partitions()) {
                TopicPartition topicPartition = new TopicPartition(description.name(), partition.partition());
                long latestOffset = latestOffsets.getOrDefault(topicPartition, 0L);
                long committedOffset = committedOffsets.getOrDefault(topicPartition, 0L);
                topicLag += Math.max(0L, latestOffset - committedOffset);
                replicaCount = Math.max(replicaCount, partition.replicas().size());
            }

            topics.add(new KafkaTopicInfo(
                    description.name(),
                    description.partitions().size(),
                    replicaCount,
                    topicLag,
                    topicLag > 0 ? "WARN" : "HEALTHY"
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
}
