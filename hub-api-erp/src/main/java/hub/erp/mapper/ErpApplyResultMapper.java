package hub.erp.mapper;

import hub.erp.domain.ErpApplyResult;
import hub.erp.dto.request.ErpApplyResultSearchCondition;
import java.util.List;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface ErpApplyResultMapper {
    List<ErpApplyResult> selectList(ErpApplyResultSearchCondition condition);
    long selectCount(ErpApplyResultSearchCondition condition);
    ErpApplyResult selectByIdAndCorpId(@Param("id") long id, @Param("corpId") long corpId);
    List<ErpApplyResult> selectByCorrelationIdAndCorpId(
            @Param("correlationId") String correlationId,
            @Param("corpId") long corpId
    );
}
