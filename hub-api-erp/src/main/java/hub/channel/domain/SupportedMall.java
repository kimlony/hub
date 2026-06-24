package hub.channel.domain;

import java.util.Arrays;
import java.util.Optional;
import lombok.Getter;
import lombok.RequiredArgsConstructor;

@Getter
@RequiredArgsConstructor
public enum SupportedMall {
    MALL_11ST("11ST", "11ST"),
    COUPANG("COUPANG", "Coupang"),
    GCHAN("GCHAN", "Gift Channel"),
    NSS("NSS", "Naver Smartstore"),
    MOCK_MALL("MOCK_MALL", "Mock Mall");

    private final String key;
    private final String name;

    public static Optional<SupportedMall> findByKey(String key) {
        return Arrays.stream(values()).filter(m -> m.key.equals(key)).findFirst();
    }
}
