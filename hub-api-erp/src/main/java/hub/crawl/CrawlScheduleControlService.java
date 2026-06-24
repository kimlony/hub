package hub.crawl;

import java.util.concurrent.atomic.AtomicBoolean;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

@Service
public class CrawlScheduleControlService {

    private final AtomicBoolean enabled;

    public CrawlScheduleControlService(
            @Value("${hub.schedule.crawl.enabled:true}") boolean initialEnabled
    ) {
        this.enabled = new AtomicBoolean(initialEnabled);
    }

    public boolean isEnabled() {
        return enabled.get();
    }

    public boolean setEnabled(boolean nextEnabled) {
        enabled.set(nextEnabled);
        return enabled.get();
    }
}
