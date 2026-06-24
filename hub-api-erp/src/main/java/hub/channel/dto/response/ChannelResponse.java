package hub.channel.dto.response;

import lombok.Builder;
import lombok.Getter;

@Getter
@Builder
public class ChannelResponse {
    private String  mallKey;
    private String  mallName;
    private boolean registered;
    private String  useYn;
    private String  mallId;
    private String  mallPw;
    private String  vendorId;
    private String  key;
    private String  key2;
    private String  authKey;
}
