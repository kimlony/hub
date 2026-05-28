package com.bizbee.hub.channel.dto;

import lombok.Getter;
import lombok.NoArgsConstructor;

@Getter
@NoArgsConstructor
public class ChannelRequest {
    private String key;
    private String key2;
    private String authKey;
    private String mallId;
    private String mallPw;
    private String vendorId;
}
