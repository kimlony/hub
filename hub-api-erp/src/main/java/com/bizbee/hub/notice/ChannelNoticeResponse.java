package com.bizbee.hub.notice;

import java.time.LocalDateTime;
import java.util.List;

public record ChannelNoticeResponse(
        List<ChannelNotice> notices,
        LocalDateTime generatedAt
) {
}
