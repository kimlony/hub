package hub.setting.dto;

import jakarta.validation.constraints.NotNull;

public record UpdateUserSettingRequest(
        @NotNull Boolean autoErpApply,
        @NotNull Boolean autoNewsCollect
) {
}
