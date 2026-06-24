package hub.outbox.domain;

public enum JobOutboxStatus {
    PENDING,
    PUBLISHING,
    SENT,
    FAILED
}