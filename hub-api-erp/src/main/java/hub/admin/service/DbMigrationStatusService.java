package hub.admin.service;

import hub.admin.dto.response.DbMigrationStatusResponse;

public interface DbMigrationStatusService {
    DbMigrationStatusResponse getStatus();
}