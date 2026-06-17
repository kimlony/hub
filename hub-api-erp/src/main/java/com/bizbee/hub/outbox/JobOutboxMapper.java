package com.bizbee.hub.outbox;

import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;

@Mapper
public interface JobOutboxMapper {

    void insert(JobOutbox outbox);

    List<JobOutbox> claimPending(
            @Param("limit") int limit,
            @Param("lockedBy") String lockedBy,
            @Param("staleSeconds") int staleSeconds
    );

    int markSent(@Param("id") Long id);

    int markRetry(
            @Param("id") Long id,
            @Param("errorMessage") String errorMessage,
            @Param("delaySeconds") int delaySeconds
    );

    int markFailed(
            @Param("id") Long id,
            @Param("errorMessage") String errorMessage
    );

    JobOutboxStats selectStats(@Param("staleSeconds") int staleSeconds);

    List<JobOutboxItem> selectRecent(
            @Param("status") String status,
            @Param("limit") int limit
    );
}
