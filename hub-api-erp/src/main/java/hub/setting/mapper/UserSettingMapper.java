package hub.setting.mapper;

import hub.setting.domain.UserSetting;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface UserSettingMapper {
    UserSetting selectByUserId(@Param("userId") long userId);
    int insertDefaultIfAbsent(@Param("userId") long userId);
    int upsert(
            @Param("userId") long userId,
            @Param("autoErpApply") boolean autoErpApply,
            @Param("autoNewsCollect") boolean autoNewsCollect
    );
    boolean existsAutoNewsCollectEnabled();
}
