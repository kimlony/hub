package hub.channel.service;

import hub.auth.AuthException;
import hub.auth.domain.HubUser;
import hub.auth.mapper.UserMapper;
import hub.channel.ChannelConflictException;
import hub.channel.ChannelNotFoundException;
import hub.channel.domain.ChannelRow;
import hub.channel.dto.request.ChannelRequest;
import hub.channel.dto.response.ChannelResponse;
import hub.channel.mapper.ChannelMapper;
import hub.config.AesEncryptor;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

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
            throw new ChannelConflictException(mallKey + " 嶺??х몭?????? ?繹먮굞夷??琉우꽑 ???곕????덈펲.");
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
                .orElseThrow(() -> new ChannelNotFoundException(mallKey + " 嶺??х몭???繹먮굞夷??? ???용┃???鍮??"));
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
                .orElseThrow(() -> new ChannelNotFoundException(mallKey + " 嶺??х몭???繹먮굞夷??? ???용┃???鍮??"));
        channelMapper.delete(user.getId(), mallKey);
    }

    @Override
    @Transactional
    public void toggleUseYn(String username, String mallKey) {
        validateMallKey(mallKey);
        HubUser user = findUser(username);
        ChannelRow existing = channelMapper.findByUserIdAndMallKey(user.getId(), mallKey)
                .orElseThrow(() -> new ChannelNotFoundException(mallKey + " 嶺??х몭???繹먮굞夷??? ???용┃???鍮??"));
        String newUseYn = "Y".equals(existing.getUseYn()) ? "N" : "Y";
        channelMapper.updateUseYn(user.getId(), mallKey, newUseYn);
    }

    private HubUser findUser(String username) {
        return userMapper.findByUsername(username)
                .orElseThrow(() -> new AuthException("?????? 嶺뚢돦堉??????怨룸????덈펲."));
    }

    private void validateMallKey(String mallKey) {
        if (!channelMapper.existsHubChannel(mallKey)) {
            throw new ChannelNotFoundException("嶺뚯솘???믨퀡由?춯?뼿 ???낅츎 嶺??х몭???낅퉵?? " + mallKey);
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
