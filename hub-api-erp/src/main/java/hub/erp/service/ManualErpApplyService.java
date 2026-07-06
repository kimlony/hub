package hub.erp.service;

import hub.erp.dto.request.ManualErpApplyRequest;
import hub.erp.dto.response.ErpConnectionItem;
import hub.erp.dto.response.ManualErpApplyCandidateResponse;
import hub.erp.dto.response.ManualErpApplyResponse;
import java.util.List;

public interface ManualErpApplyService {
    List<ErpConnectionItem> getActiveConnections(String username);
    ManualErpApplyCandidateResponse getCandidates(String username, String erpConnectionId, String channelCd,
                                                   String erpStatus, int page, int size);
    ManualErpApplyResponse requestApply(String username, ManualErpApplyRequest request);
}