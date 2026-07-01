package hub.port;

import hub.job.event.HubJobEvent;

public interface JobEventPort {

    void publish(HubJobEvent event);

    default void publish(HubJobEvent event, String partitionKey) {
        publish(event);
    }
}
