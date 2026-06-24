package hub.schedule.controller;

import hub.schedule.dto.request.CollectScheduleEnabledRequest;
import hub.schedule.dto.request.CollectScheduleRequest;
import hub.schedule.dto.response.CollectScheduleListResponse;
import hub.schedule.dto.response.CollectScheduleResponse;
import hub.schedule.service.CollectScheduleService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/hub/schedules")
@RequiredArgsConstructor
public class CollectScheduleController {

    private final CollectScheduleService collectScheduleService;

    @GetMapping
    public ResponseEntity<CollectScheduleListResponse> getSchedules(@AuthenticationPrincipal String username) {
        return ResponseEntity.ok(collectScheduleService.getSchedules(username));
    }

    @PostMapping
    public ResponseEntity<CollectScheduleResponse> createSchedule(
            @AuthenticationPrincipal String username,
            @Valid @RequestBody CollectScheduleRequest request
    ) {
        return ResponseEntity.ok(collectScheduleService.createSchedule(username, request));
    }

    @PutMapping("/{id}")
    public ResponseEntity<CollectScheduleResponse> updateSchedule(
            @AuthenticationPrincipal String username,
            @PathVariable Long id,
            @Valid @RequestBody CollectScheduleRequest request
    ) {
        return ResponseEntity.ok(collectScheduleService.updateSchedule(username, id, request));
    }

    @PatchMapping("/{id}/enabled")
    public ResponseEntity<Void> updateEnabled(
            @AuthenticationPrincipal String username,
            @PathVariable Long id,
            @Valid @RequestBody CollectScheduleEnabledRequest request
    ) {
        collectScheduleService.updateEnabled(username, id, request);
        return ResponseEntity.ok().build();
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> deleteSchedule(
            @AuthenticationPrincipal String username,
            @PathVariable Long id
    ) {
        collectScheduleService.deleteSchedule(username, id);
        return ResponseEntity.ok().build();
    }
}
