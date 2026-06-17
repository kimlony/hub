package com.bizbee.hub.outbox;

public enum JobOutboxStatus {
    PENDING,
    PUBLISHING,
    SENT,
    FAILED
}