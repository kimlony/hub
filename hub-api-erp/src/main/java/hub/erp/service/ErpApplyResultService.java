package hub.erp.service;

import hub.erp.dto.request.ErpApplyResultSearchCondition;
import hub.erp.dto.response.ErpApplyResultDetailResponse;
import hub.erp.dto.response.ErpApplyResultListResponse;

public interface ErpApplyResultService {
    ErpApplyResultListResponse getResults(ErpApplyResultSearchCondition condition, int page, int size);
    ErpApplyResultDetailResponse getResult(long id, long corpId);
}
