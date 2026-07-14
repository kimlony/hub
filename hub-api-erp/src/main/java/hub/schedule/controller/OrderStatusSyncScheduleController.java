package hub.schedule.controller;

import hub.auth.HubUserPrincipal;
import hub.schedule.dto.request.OrderStatusSyncScheduleEnabledRequest;
import hub.schedule.dto.request.OrderStatusSyncScheduleRequest;
import hub.schedule.dto.response.OrderStatusSyncScheduleListResponse;
import hub.schedule.dto.response.OrderStatusSyncScheduleResponse;
import hub.schedule.service.OrderStatusSyncScheduleService;
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
@RequestMapping("/api/hub/status-sync-schedules")
@RequiredArgsConstructor
public class OrderStatusSyncScheduleController {

    private final OrderStatusSyncScheduleService orderStatusSyncScheduleService;

    @GetMapping
    public ResponseEntity<OrderStatusSyncScheduleListResponse> getSchedules(@AuthenticationPrincipal HubUserPrincipal principal) {
        return ResponseEntity.ok(orderStatusSyncScheduleService.getSchedules(principal.username()));
    }

    @PostMapping
    public ResponseEntity<OrderStatusSyncScheduleResponse> createSchedule(
            @AuthenticationPrincipal HubUserPrincipal principal,
            @Valid @RequestBody OrderStatusSyncScheduleRequest request
    ) {
        return ResponseEntity.ok(orderStatusSyncScheduleService.createSchedule(principal.username(), request));
    }

    @PutMapping("/{id}")
    public ResponseEntity<OrderStatusSyncScheduleResponse> updateSchedule(
            @AuthenticationPrincipal HubUserPrincipal principal,
            @PathVariable Long id,
            @Valid @RequestBody OrderStatusSyncScheduleRequest request
    ) {
        return ResponseEntity.ok(orderStatusSyncScheduleService.updateSchedule(principal.username(), id, request));
    }

    @PatchMapping("/{id}/enabled")
    public ResponseEntity<Void> updateEnabled(
            @AuthenticationPrincipal HubUserPrincipal principal,
            @PathVariable Long id,
            @Valid @RequestBody OrderStatusSyncScheduleEnabledRequest request
    ) {
        orderStatusSyncScheduleService.updateEnabled(principal.username(), id, request);
        return ResponseEntity.ok().build();
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> deleteSchedule(
            @AuthenticationPrincipal HubUserPrincipal principal,
            @PathVariable Long id
    ) {
        orderStatusSyncScheduleService.deleteSchedule(principal.username(), id);
        return ResponseEntity.ok().build();
    }
}
