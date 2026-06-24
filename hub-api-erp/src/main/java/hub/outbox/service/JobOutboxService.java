package hub.outbox.service;

import hub.job.event.HubJobEvent;

public interface JobOutboxService {

    void enqueue(HubJobEvent event);
}