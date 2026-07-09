package hub.admin.controller;

import hub.admin.dto.response.DbMigrationStatusResponse;
import hub.admin.service.DbMigrationStatusService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/admin/db-migrations")
@RequiredArgsConstructor
public class DbMigrationStatusController {

    private final DbMigrationStatusService dbMigrationStatusService;

    @GetMapping
    public DbMigrationStatusResponse getStatus() {
        return dbMigrationStatusService.getStatus();
    }
}