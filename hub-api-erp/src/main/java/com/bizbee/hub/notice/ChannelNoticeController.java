package com.bizbee.hub.notice;

import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/hub/notices")
@RequiredArgsConstructor
public class ChannelNoticeController {

    private final ChannelNoticeService channelNoticeService;

    @GetMapping("/active")
    public ResponseEntity<ChannelNoticeResponse> getActiveNotices() {
        return ResponseEntity.ok(channelNoticeService.getActiveNotices());
    }
}
