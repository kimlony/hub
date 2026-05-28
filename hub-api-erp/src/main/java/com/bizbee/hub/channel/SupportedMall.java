package com.bizbee.hub.channel;

import lombok.Getter;
import lombok.RequiredArgsConstructor;

import java.util.Arrays;
import java.util.Optional;

@Getter
@RequiredArgsConstructor
public enum SupportedMall {
    MALL_11ST("11ST",    "11번가"),
    COUPANG(  "COUPANG", "쿠팡"),
    GCHAN(    "GCHAN",   "선물찬스"),
    NSS(      "NSS",     "네이버 스마트스토어");

    private final String key;
    private final String name;

    public static Optional<SupportedMall> findByKey(String key) {
        return Arrays.stream(values()).filter(m -> m.key.equals(key)).findFirst();
    }
}
