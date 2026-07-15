package hub.loadtest.dto.request;

public record MockMallLoadTestRequest(
        Integer orders,
        Integer pageSize,
        String seed,
        String fixtureFile,
        String scenario,
        Integer delayMs,
        Double errorRate,
        Double timeoutRate
) {
}
