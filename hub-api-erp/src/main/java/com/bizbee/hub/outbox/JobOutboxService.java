package com.bizbee.hub.outbox;

import com.bizbee.hub.job.HubJobEvent;

public interface JobOutboxService {

    void enqueue(HubJobEvent event);
}