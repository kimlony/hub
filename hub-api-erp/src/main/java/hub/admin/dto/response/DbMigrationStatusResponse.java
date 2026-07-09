package hub.admin.dto.response;

import java.time.OffsetDateTime;
import java.util.List;

public record DbMigrationStatusResponse(
        String currentVersion,
        String latestKnownVersion,
        boolean schemaUpToDate,
        int appliedCount,
        int pendingCount,
        int failedCount,
        List<MigrationItem> migrations
) {
    public record MigrationItem(
            String version,
            String description,
            String script,
            String state,
            OffsetDateTime installedOn,
            String installedBy,
            Integer executionTime,
            Integer checksum
    ) {
    }
}