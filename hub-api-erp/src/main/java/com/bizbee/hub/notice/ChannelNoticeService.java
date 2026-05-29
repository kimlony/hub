package com.bizbee.hub.notice;

public interface ChannelNoticeService {
    ChannelNoticeResponse getActiveNotices();
    void scanExternalChannelIssues();
}
