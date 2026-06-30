package hub.channel.mapper;

import hub.channel.domain.ChannelRow;
import hub.channel.domain.HubChannel;
import java.util.List;
import java.util.Optional;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface ChannelMapper {
    List<HubChannel>     findAllHubChannels();
    boolean              existsHubChannel(@Param("mallKey") String mallKey);
    List<ChannelRow>     findAllByCorpId(@Param("corpId") Long corpId);
    Optional<ChannelRow> findByCorpIdAndId(@Param("corpId") Long corpId,
                                           @Param("id") Long id);
    Optional<ChannelRow> findActiveByCorpIdAndId(@Param("corpId") Long corpId,
                                                 @Param("id") Long id);
    List<ChannelRow>     findActiveByCorpIdAndMallKey(@Param("corpId") Long corpId,
                                                      @Param("mallKey") String mallKey);
    Optional<ChannelRow> findAnyByCorpIdAndMallKey(@Param("corpId") Long corpId,
                                                   @Param("mallKey") String mallKey);
    void insert(ChannelRow row);
    void update(ChannelRow row);
    void delete(@Param("corpId") Long corpId, @Param("id") Long id);
    void updateUseYn(@Param("corpId") Long corpId,
                     @Param("id") Long id,
                     @Param("useYn") String useYn);
}
