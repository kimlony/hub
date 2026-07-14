package hub.setting.controller;

import hub.auth.HubUserPrincipal;
import hub.setting.dto.UpdateUserSettingRequest;
import hub.setting.dto.UserSettingResponse;
import hub.setting.service.UserSettingService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/hub/settings")
@RequiredArgsConstructor
public class UserSettingController {
    private final UserSettingService userSettingService;

    @GetMapping
    public ResponseEntity<UserSettingResponse> getSetting(@AuthenticationPrincipal HubUserPrincipal principal) {
        return ResponseEntity.ok(userSettingService.getSetting(principal.username()));
    }

    @PutMapping
    public ResponseEntity<UserSettingResponse> updateSetting(
            @AuthenticationPrincipal HubUserPrincipal principal,
            @Valid @RequestBody UpdateUserSettingRequest request
    ) {
        return ResponseEntity.ok(userSettingService.updateSetting(principal.username(), request));
    }
}
