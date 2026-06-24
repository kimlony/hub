package hub.notice.service;

import hub.notice.dto.response.ChannelNoticeResponse;

public interface ChannelNoticeService {
    ChannelNoticeResponse getActiveNotices();
    void scanExternalChannelIssues();
}
