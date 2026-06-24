package hub.channel.domain;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ChannelRow {
    private Long   userId;
    private String mallKey;
    private String key;
    private String key2;
    private String authKey;
    private String mallId;
    private String mallPw;
    private String useYn;
    private String vendorId;
}
