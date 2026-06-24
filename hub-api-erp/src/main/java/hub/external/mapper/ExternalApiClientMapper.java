package hub.external.mapper;

import hub.external.domain.ExternalApiClientRow;
import java.util.List;
import java.util.Optional;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface ExternalApiClientMapper {
    List<ExternalApiClientRow> findByUserId(Long userId);

    Optional<ExternalApiClientRow> findByClientId(String clientId);

    Optional<ExternalApiClientRow> findByUserIdAndClientId(@Param("userId") Long userId,
                                                           @Param("clientId") String clientId);

    void insert(ExternalApiClientRow row);
}
