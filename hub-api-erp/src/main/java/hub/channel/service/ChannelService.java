package hub.channel.service;

import hub.channel.dto.request.ChannelRequest;
import hub.channel.dto.response.ChannelResponse;
import java.util.List;

public interface ChannelService {
    List<ChannelResponse> getChannels(String username);
    void register(String username, String mallKey, ChannelRequest request);
    void update(String username, String mallKey, ChannelRequest request);
    void delete(String username, String mallKey);
    void toggleUseYn(String username, String mallKey);
}
