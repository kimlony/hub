package hub.setting;

import hub.setting.controller.UserSettingController;
import hub.setting.dto.UpdateUserSettingRequest;
import hub.setting.dto.UserSettingResponse;
import hub.setting.service.UserSettingService;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class UserSettingControllerTest {
    private final UserSettingService service = mock(UserSettingService.class);
    private final UserSettingController controller = new UserSettingController(service);

    @Test
    void getsCurrentUserSetting() {
        when(service.getSetting("admin")).thenReturn(new UserSettingResponse(false, false));
        assertThat(controller.getSetting("admin").getBody())
                .isEqualTo(new UserSettingResponse(false, false));
    }

    @Test
    void updatesCurrentUserSetting() {
        var request = new UpdateUserSettingRequest(true, true);
        when(service.updateSetting("admin", request)).thenReturn(new UserSettingResponse(true, true));
        assertThat(controller.updateSetting("admin", request).getBody())
                .isEqualTo(new UserSettingResponse(true, true));
        verify(service).updateSetting("admin", request);
    }
}
