package hub.setting;

import hub.crawl.CrawlScheduleControlService;
import hub.setting.mapper.UserSettingMapper;
import jakarta.annotation.PostConstruct;
import lombok.RequiredArgsConstructor;
import org.springframework.context.annotation.DependsOn;
import org.springframework.stereotype.Component;

@Component
@DependsOn("flywayInitializer")
@RequiredArgsConstructor
public class UserSettingNewsScheduleInitializer {
    private final UserSettingMapper userSettingMapper;
    private final CrawlScheduleControlService crawlScheduleControlService;

    @PostConstruct
    public void initialize() {
        crawlScheduleControlService.setEnabled(userSettingMapper.existsAutoNewsCollectEnabled());
    }
}
