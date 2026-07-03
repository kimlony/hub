package hub.setting.domain;

import java.time.OffsetDateTime;
import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
public class UserSetting {
    private Long userId;
    private boolean autoErpApply;
    private boolean autoNewsCollect;
    private OffsetDateTime createdAt;
    private OffsetDateTime updatedAt;
}
