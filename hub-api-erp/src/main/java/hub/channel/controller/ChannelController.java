package hub.channel.controller;

import hub.channel.dto.request.ChannelRequest;
import hub.channel.dto.response.ChannelResponse;
import hub.channel.service.ChannelService;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

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

    @PutMapping("/accounts/{channelAccountId}")
    public ResponseEntity<Void> update(
            @AuthenticationPrincipal String username,
            @PathVariable Long channelAccountId,
            @RequestBody ChannelRequest request) {
        channelService.update(username, channelAccountId, request);
        return ResponseEntity.ok().build();
    }

    @DeleteMapping("/accounts/{channelAccountId}")
    public ResponseEntity<Void> delete(
            @AuthenticationPrincipal String username,
            @PathVariable Long channelAccountId) {
        channelService.delete(username, channelAccountId);
        return ResponseEntity.noContent().build();
    }

    @PatchMapping("/accounts/{channelAccountId}/active")
    public ResponseEntity<Void> toggleUseYn(
            @AuthenticationPrincipal String username,
            @PathVariable Long channelAccountId) {
        channelService.toggleUseYn(username, channelAccountId);
        return ResponseEntity.ok().build();
    }
}
