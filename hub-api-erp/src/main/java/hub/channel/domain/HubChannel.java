package hub.channel.domain;

import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Getter
@Setter
@NoArgsConstructor
public class HubChannel {
    private String mallKey;
    private String mallName;
    private int    sortOrder;
}
