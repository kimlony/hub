package hub.job.execution.domain;

public enum JobAttemptStatus {
    PROCESSING,
    SUCCESS,
    RETRY,
    FAILED,
    EXPIRED
}
