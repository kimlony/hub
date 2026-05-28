package com.bizbee.hub.channel;

import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;
import java.util.Optional;

@Mapper
public interface ChannelMapper {
    List<HubChannel>     findAllHubChannels();
    boolean              existsHubChannel(@Param("mallKey") String mallKey);
    List<ChannelRow>     findAllByUserId(@Param("userId") Long userId);
    Optional<ChannelRow> findByUserIdAndMallKey(@Param("userId") Long userId,
                                                @Param("mallKey") String mallKey);
    Optional<ChannelRow> findActiveByUserIdAndMallKey(@Param("userId") Long userId,
                                                      @Param("mallKey") String mallKey);
    void insert(ChannelRow row);
    void update(ChannelRow row);
    void delete(@Param("userId") Long userId, @Param("mallKey") String mallKey);
    void updateUseYn(@Param("userId") Long userId,
                     @Param("mallKey") String mallKey,
                     @Param("useYn") String useYn);
}
