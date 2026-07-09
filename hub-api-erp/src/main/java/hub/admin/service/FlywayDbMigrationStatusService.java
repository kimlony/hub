package hub.admin.service;

import hub.admin.dto.response.DbMigrationStatusResponse;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.util.Arrays;
import java.util.Comparator;
import java.util.Date;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.flywaydb.core.Flyway;
import org.flywaydb.core.api.MigrationInfo;
import org.flywaydb.core.api.MigrationVersion;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
public class FlywayDbMigrationStatusService implements DbMigrationStatusService {

    private static final ZoneId SEOUL = ZoneId.of("Asia/Seoul");

    private final Flyway flyway;

    @Override
    public DbMigrationStatusResponse getStatus() {
        MigrationInfo[] all = flyway.info().all();
        MigrationInfo current = flyway.info().current();
        String currentVersion = versionOf(current);
        String latestKnownVersion = Arrays.stream(all)
                .map(MigrationInfo::getVersion)
                .filter(version -> version != null)
                .max(Comparator.naturalOrder())
                .map(MigrationVersion::getVersion)
                .orElse(null);

        List<DbMigrationStatusResponse.MigrationItem> migrations = Arrays.stream(all)
                .map(this::toItem)
                .toList();
        int appliedCount = (int) Arrays.stream(all)
                .filter(info -> info.getState().isApplied())
                .count();
        int pendingCount = flyway.info().pending().length;
        int failedCount = (int) Arrays.stream(all)
                .filter(info -> info.getState().isFailed())
                .count();

        return new DbMigrationStatusResponse(
                currentVersion,
                latestKnownVersion,
                currentVersion != null && currentVersion.equals(latestKnownVersion),
                appliedCount,
                pendingCount,
                failedCount,
                migrations
        );
    }

    private DbMigrationStatusResponse.MigrationItem toItem(MigrationInfo info) {
        return new DbMigrationStatusResponse.MigrationItem(
                versionOf(info),
                info.getDescription(),
                info.getScript(),
                info.getState().getDisplayName(),
                toOffsetDateTime(info.getInstalledOn()),
                info.getInstalledBy(),
                info.getExecutionTime(),
                info.getChecksum()
        );
    }

    private static String versionOf(MigrationInfo info) {
        if (info == null || info.getVersion() == null) {
            return null;
        }
        return info.getVersion().getVersion();
    }

    private static OffsetDateTime toOffsetDateTime(Date date) {
        if (date == null) {
            return null;
        }
        return date.toInstant().atZone(SEOUL).toOffsetDateTime();
    }
}