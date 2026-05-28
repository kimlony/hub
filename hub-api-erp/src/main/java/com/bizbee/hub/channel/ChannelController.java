package com.bizbee.hub.channel;

import com.bizbee.hub.channel.dto.ChannelRequest;
import com.bizbee.hub.channel.dto.ChannelResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/channels")
@RequiredArgsConstructor
public class ChannelController {

    private final ChannelService channelService;

    @GetMapping
    public ResponseEntity<List<ChannelResponse>> getChannels(
            @AuthenticationPrincipal String username) {
        return ResponseEntity.ok(channelService.getChannels(username));
    }

    @PostMapping("/{mallKey}")
    public ResponseEntity<Void> register(
            @AuthenticationPrincipal String username,
            @PathVariable String mallKey,
            @RequestBody ChannelRequest request) {
        channelService.register(username, mallKey, request);
        return ResponseEntity.ok().build();
    }

    @PutMapping("/{mallKey}")
    public ResponseEntity<Void> update(
            @AuthenticationPrincipal String username,
            @PathVariable String mallKey,
            @RequestBody ChannelRequest request) {
        channelService.update(username, mallKey, request);
        return ResponseEntity.ok().build();
    }

    @DeleteMapping("/{mallKey}")
    public ResponseEntity<Void> delete(
            @AuthenticationPrincipal String username,
            @PathVariable String mallKey) {
        channelService.delete(username, mallKey);
        return ResponseEntity.noContent().build();
    }

    @PatchMapping("/{mallKey}/active")
    public ResponseEntity<Void> toggleUseYn(
            @AuthenticationPrincipal String username,
            @PathVariable String mallKey) {
        channelService.toggleUseYn(username, mallKey);
        return ResponseEntity.ok().build();
    }
}
