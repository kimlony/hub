package hub.setting;

import hub.auth.domain.HubUser;
import hub.auth.mapper.UserMapper;
import hub.crawl.CrawlScheduleControlService;
import hub.setting.domain.UserSetting;
import hub.setting.dto.UpdateUserSettingRequest;
import hub.setting.mapper.UserSettingMapper;
import hub.setting.service.UserSettingServiceImpl;
import java.util.Optional;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class UserSettingServiceImplTest {
    private final UserSettingMapper settingMapper = mock(UserSettingMapper.class);
    private final UserMapper userMapper = mock(UserMapper.class);
    private final CrawlScheduleControlService crawlControl = mock(CrawlScheduleControlService.class);
    private final UserSettingServiceImpl service =
            new UserSettingServiceImpl(settingMapper, userMapper, crawlControl);

    @Test
    void returnsAndCreatesFalseDefaultsWhenSettingDoesNotExist() {
        when(userMapper.findByUsername("admin")).thenReturn(Optional.of(user()));
        when(settingMapper.selectByUserId(1L)).thenReturn(null);

        var response = service.getSetting("admin");

        assertThat(response.autoErpApply()).isFalse();
        assertThat(response.autoNewsCollect()).isFalse();
        verify(settingMapper).insertDefaultIfAbsent(1L);
    }

    @Test
    void upsertsBothSettingsAndSynchronizesNewsScheduler() {
        when(userMapper.findByUsername("admin")).thenReturn(Optional.of(user()));
        when(settingMapper.existsAutoNewsCollectEnabled()).thenReturn(true);

        var response = service.updateSetting("admin", new UpdateUserSettingRequest(true, true));

        assertThat(response.autoErpApply()).isTrue();
        assertThat(response.autoNewsCollect()).isTrue();
        verify(settingMapper).upsert(1L, true, true);
        verify(crawlControl).setEnabled(true);
    }

    @Test
    void returnsPersistedSetting() {
        when(userMapper.findByUsername("admin")).thenReturn(Optional.of(user()));
        UserSetting setting = new UserSetting();
        setting.setUserId(1L);
        setting.setAutoErpApply(true);
        setting.setAutoNewsCollect(false);
        when(settingMapper.selectByUserId(1L)).thenReturn(setting);

        var response = service.getSetting("admin");

        assertThat(response.autoErpApply()).isTrue();
        assertThat(response.autoNewsCollect()).isFalse();
    }

    private HubUser user() {
        HubUser user = new HubUser();
        user.setId(1L);
        user.setUsername("admin");
        return user;
    }
}
