package hub.setting.service;

import hub.setting.dto.UpdateUserSettingRequest;
import hub.setting.dto.UserSettingResponse;

public interface UserSettingService {
    UserSettingResponse getSetting(String username);
    UserSettingResponse updateSetting(String username, UpdateUserSettingRequest request);
}
