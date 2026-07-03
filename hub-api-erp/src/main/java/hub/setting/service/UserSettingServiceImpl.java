package hub.setting.service;

import hub.auth.AuthException;
import hub.auth.domain.HubUser;
import hub.auth.mapper.UserMapper;
import hub.crawl.CrawlScheduleControlService;
import hub.setting.domain.UserSetting;
import hub.setting.dto.UpdateUserSettingRequest;
import hub.setting.dto.UserSettingResponse;
import hub.setting.mapper.UserSettingMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class UserSettingServiceImpl implements UserSettingService {
    private final UserSettingMapper userSettingMapper;
    private final UserMapper userMapper;
    private final CrawlScheduleControlService crawlScheduleControlService;

    @Override
    @Transactional
    public UserSettingResponse getSetting(String username) {
        HubUser user = findUser(username);
        UserSetting setting = userSettingMapper.selectByUserId(user.getId());
        if (setting == null) {
            userSettingMapper.insertDefaultIfAbsent(user.getId());
            setting = userSettingMapper.selectByUserId(user.getId());
        }
        UserSettingResponse response = setting == null
                ? new UserSettingResponse(false, false)
                : toResponse(setting);
        return response;
    }

    @Override
    @Transactional
    public UserSettingResponse updateSetting(String username, UpdateUserSettingRequest request) {
        HubUser user = findUser(username);
        userSettingMapper.upsert(user.getId(), request.autoErpApply(), request.autoNewsCollect());
        crawlScheduleControlService.setEnabled(userSettingMapper.existsAutoNewsCollectEnabled());
        return new UserSettingResponse(request.autoErpApply(), request.autoNewsCollect());
    }

    private HubUser findUser(String username) {
        return userMapper.findByUsername(username)
                .orElseThrow(() -> new AuthException("user not found"));
    }

    private UserSettingResponse toResponse(UserSetting setting) {
        return new UserSettingResponse(setting.isAutoErpApply(), setting.isAutoNewsCollect());
    }
}
