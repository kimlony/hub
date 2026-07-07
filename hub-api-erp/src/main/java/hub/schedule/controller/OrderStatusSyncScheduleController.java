package hub.schedule.controller;

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
    public ResponseEntity<OrderStatusSyncScheduleListResponse> getSchedules(@AuthenticationPrincipal String username) {
        return ResponseEntity.ok(orderStatusSyncScheduleService.getSchedules(username));
    }

    @PostMapping
    public ResponseEntity<OrderStatusSyncScheduleResponse> createSchedule(
            @AuthenticationPrincipal String username,
            @Valid @RequestBody OrderStatusSyncScheduleRequest request
    ) {
        return ResponseEntity.ok(orderStatusSyncScheduleService.createSchedule(username, request));
    }

    @PutMapping("/{id}")
    public ResponseEntity<OrderStatusSyncScheduleResponse> updateSchedule(
            @AuthenticationPrincipal String username,
            @PathVariable Long id,
            @Valid @RequestBody OrderStatusSyncScheduleRequest request
    ) {
        return ResponseEntity.ok(orderStatusSyncScheduleService.updateSchedule(username, id, request));
    }

    @PatchMapping("/{id}/enabled")
    public ResponseEntity<Void> updateEnabled(
            @AuthenticationPrincipal String username,
            @PathVariable Long id,
            @Valid @RequestBody OrderStatusSyncScheduleEnabledRequest request
    ) {
        orderStatusSyncScheduleService.updateEnabled(username, id, request);
        return ResponseEntity.ok().build();
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> deleteSchedule(
            @AuthenticationPrincipal String username,
            @PathVariable Long id
    ) {
        orderStatusSyncScheduleService.deleteSchedule(username, id);
        return ResponseEntity.ok().build();
    }
}
