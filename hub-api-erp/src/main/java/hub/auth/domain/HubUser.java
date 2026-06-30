package hub.auth.domain;

import java.util.List;
import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
public class HubUser {
    private Long         id;
    private Long         corpId;
    private String       corpCd;
    private String       username;
    private String       password;
    private List<String> mallKeys;
}
