package hub.worker.mapper;

import hub.worker.dto.response.WorkerStatusItem;
import java.util.List;
import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface WorkerStatusMapper {

    List<WorkerStatusItem> selectWorkerStatuses();
}
