package hub.outbox.service;

import hub.job.event.HubJobEvent;

public interface JobOutboxService {

    void enqueue(HubJobEvent event);

    void enqueue(HubJobEvent event, String partitionKey);

    String findLatestPartitionKey(String requestId);

    String resolvePartitionKey(HubJobEvent event);
}
