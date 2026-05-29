package com.bizbee.hub.worker;

import java.util.List;
import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface WorkerStatusMapper {

    List<WorkerStatusItem> selectWorkerStatuses();
}
