package com.bizbee.hub.channel;

import com.bizbee.hub.auth.AuthException;
import com.bizbee.hub.auth.HubUser;
import com.bizbee.hub.auth.UserMapper;
import com.bizbee.hub.channel.dto.ChannelRequest;
import com.bizbee.hub.channel.dto.ChannelResponse;
import com.bizbee.hub.config.AesEncryptor;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class ChannelServiceImpl implements ChannelService {

    private final ChannelMapper channelMapper;
    private final UserMapper    userMapper;
    private final AesEncryptor  aesEncryptor;

    @Override
    public List<ChannelResponse> getChannels(String username) {
        HubUser user = findUser(username);
        Map<String, ChannelRow> rowMap = channelMapper.findAllByUserId(user.getId())
                .stream().collect(Collectors.toMap(ChannelRow::getMallKey, r -> r));

        return channelMapper.findAllHubChannels()
                .stream()
                .map(mall -> {
                    ChannelRow row = rowMap.get(mall.getMallKey());
                    if (row == null) {
                        return ChannelResponse.builder()
                                .mallKey(mall.getMallKey())
                                .mallName(mall.getMallName())
                                .registered(false)
                                .build();
                    }
                    return ChannelResponse.builder()
                            .mallKey(mall.getMallKey())
                            .mallName(mall.getMallName())
                            .registered(true)
                            .useYn(row.getUseYn())
                            .mallId(mask(row.getMallId()))
                            .mallPw(mask(row.getMallPw()))
                            .vendorId(mask(row.getVendorId()))
                            .key(mask(row.getKey()))
                            .key2(mask(row.getKey2()))
                            .authKey(mask(row.getAuthKey()))
                            .build();
                })
                .collect(Collectors.toList());
    }

    @Override
    @Transactional
    public void register(String username, String mallKey, ChannelRequest request) {
        validateMallKey(mallKey);
        HubUser user = findUser(username);
        if (channelMapper.findByUserIdAndMallKey(user.getId(), mallKey).isPresent()) {
            throw new ChannelConflictException(mallKey + " 채널이 이미 등록되어 있습니다.");
        }
        channelMapper.insert(ChannelRow.builder()
                .userId(user.getId())
                .mallKey(mallKey)
                .key(aesEncryptor.encrypt(request.getKey()))
                .key2(aesEncryptor.encrypt(request.getKey2()))
                .authKey(aesEncryptor.encrypt(request.getAuthKey()))
                .mallId(aesEncryptor.encrypt(request.getMallId()))
                .mallPw(aesEncryptor.encrypt(request.getMallPw()))
                .vendorId(aesEncryptor.encrypt(request.getVendorId()))
                .useYn("Y")
                .build());
    }

    @Override
    @Transactional
    public void update(String username, String mallKey, ChannelRequest request) {
        validateMallKey(mallKey);
        HubUser user = findUser(username);
        ChannelRow existing = channelMapper.findByUserIdAndMallKey(user.getId(), mallKey)
                .orElseThrow(() -> new ChannelNotFoundException(mallKey + " 채널이 등록되지 않았습니다."));
        channelMapper.update(ChannelRow.builder()
                .userId(user.getId())
                .mallKey(mallKey)
                .key(encryptOrKeep(request.getKey(), existing.getKey()))
                .key2(encryptOrKeep(request.getKey2(), existing.getKey2()))
                .authKey(encryptOrKeep(request.getAuthKey(), existing.getAuthKey()))
                .mallId(encryptOrKeep(request.getMallId(), existing.getMallId()))
                .mallPw(encryptOrKeep(request.getMallPw(), existing.getMallPw()))
                .vendorId(encryptOrKeep(request.getVendorId(), existing.getVendorId()))
                .build());
    }

    @Override
    @Transactional
    public void delete(String username, String mallKey) {
        validateMallKey(mallKey);
        HubUser user = findUser(username);
        channelMapper.findByUserIdAndMallKey(user.getId(), mallKey)
                .orElseThrow(() -> new ChannelNotFoundException(mallKey + " 채널이 등록되지 않았습니다."));
        channelMapper.delete(user.getId(), mallKey);
    }

    @Override
    @Transactional
    public void toggleUseYn(String username, String mallKey) {
        validateMallKey(mallKey);
        HubUser user = findUser(username);
        ChannelRow existing = channelMapper.findByUserIdAndMallKey(user.getId(), mallKey)
                .orElseThrow(() -> new ChannelNotFoundException(mallKey + " 채널이 등록되지 않았습니다."));
        String newUseYn = "Y".equals(existing.getUseYn()) ? "N" : "Y";
        channelMapper.updateUseYn(user.getId(), mallKey, newUseYn);
    }

    private HubUser findUser(String username) {
        return userMapper.findByUsername(username)
                .orElseThrow(() -> new AuthException("사용자를 찾을 수 없습니다."));
    }

    private void validateMallKey(String mallKey) {
        if (!channelMapper.existsHubChannel(mallKey)) {
            throw new ChannelNotFoundException("지원하지 않는 채널입니다: " + mallKey);
        }
    }

    private String mask(String value) {
        return value != null ? "****" : null;
    }

    private String encryptOrKeep(String newValue, String existingEncrypted) {
        return (newValue != null && !newValue.isBlank())
                ? aesEncryptor.encrypt(newValue)
                : existingEncrypted;
    }
}
