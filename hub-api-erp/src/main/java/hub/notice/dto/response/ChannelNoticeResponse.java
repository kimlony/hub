package hub.notice.dto.response;

import hub.notice.domain.ChannelNotice;
import java.time.LocalDateTime;
import java.util.List;

public record ChannelNoticeResponse(
        List<ChannelNotice> notices,
        LocalDateTime generatedAt
) {
}
