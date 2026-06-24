package hub.auth.mapper;

import hub.auth.domain.HubUser;
import java.util.List;
import java.util.Optional;
import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface UserMapper {
    Optional<HubUser> findById(Long id);
    Optional<HubUser> findByUsername(String username);
    List<String>      findMallKeysByUserId(Long userId);
}
