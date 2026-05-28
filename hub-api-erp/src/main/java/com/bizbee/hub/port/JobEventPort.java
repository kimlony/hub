package com.bizbee.hub.port;

import com.bizbee.hub.job.HubJobEvent;

public interface JobEventPort {

    void publish(HubJobEvent event);
}
