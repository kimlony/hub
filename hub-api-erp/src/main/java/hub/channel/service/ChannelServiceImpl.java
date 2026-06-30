package hub.channel.service;

import hub.auth.AuthException;
import hub.auth.domain.HubUser;
import hub.auth.mapper.UserMapper;
import hub.channel.ChannelNotFoundException;
import hub.channel.domain.ChannelRow;
import hub.channel.dto.request.ChannelRequest;
import hub.channel.dto.response.ChannelResponse;
import hub.channel.mapper.ChannelMapper;
import hub.config.AesEncryptor;
import java.util.ArrayList;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class ChannelServiceImpl implements ChannelService {

    private final ChannelMapper channelMapper;
    private final UserMapper userMapper;
    private final AesEncryptor aesEncryptor;

    @Override
    public List<ChannelResponse> getChannels(String username) {
        HubUser user = findUser(username);
        List<ChannelRow> accounts = channelMapper.findAllByCorpId(user.getCorpId());
        List<ChannelResponse> responses = new ArrayList<>();

        channelMapper.findAllHubChannels().forEach(mall -> {
            List<ChannelRow> mallAccounts = accounts.stream()
                    .filter(row -> mall.getMallKey().equals(row.getMallKey()))
                    .toList();
            mallAccounts.forEach(row -> responses.add(toResponse(mall.getMallName(), row)));
            responses.add(ChannelResponse.builder()
                    .corpId(user.getCorpId())
                    .mallKey(mall.getMallKey())
                    .mallName(mall.getMallName())
                    .registered(false)
                    .build());
        });
        return responses;
    }

    @Override
    @Transactional
    public void register(String username, String mallKey, ChannelRequest request) {
        validateMallKey(mallKey);
        HubUser user = findUser(username);
        channelMapper.insert(ChannelRow.builder()
                .corpId(user.getCorpId())
                .userId(user.getId())
                .mallKey(mallKey)
                .accountName(defaultAccountName(request.getAccountName(), mallKey))
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
    public void update(String username, Long channelAccountId, ChannelRequest request) {
        HubUser user = findUser(username);
        ChannelRow existing = findChannelAccount(user.getCorpId(), channelAccountId);
        channelMapper.update(ChannelRow.builder()
                .id(existing.getId())
                .corpId(user.getCorpId())
                .userId(user.getId())
                .mallKey(existing.getMallKey())
                .accountName(defaultAccountName(request.getAccountName(), existing.getAccountName()))
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
    public void delete(String username, Long channelAccountId) {
        HubUser user = findUser(username);
        findChannelAccount(user.getCorpId(), channelAccountId);
        channelMapper.delete(user.getCorpId(), channelAccountId);
    }

    @Override
    @Transactional
    public void toggleUseYn(String username, Long channelAccountId) {
        HubUser user = findUser(username);
        ChannelRow existing = findChannelAccount(user.getCorpId(), channelAccountId);
        String newUseYn = "Y".equals(existing.getUseYn()) ? "N" : "Y";
        channelMapper.updateUseYn(user.getCorpId(), channelAccountId, newUseYn);
    }

    private HubUser findUser(String username) {
        return userMapper.findByUsername(username)
                .orElseThrow(() -> new AuthException("user not found"));
    }

    private ChannelRow findChannelAccount(Long corpId, Long channelAccountId) {
        return channelMapper.findByCorpIdAndId(corpId, channelAccountId)
                .orElseThrow(() -> new ChannelNotFoundException("channel account not found: " + channelAccountId));
    }

    private void validateMallKey(String mallKey) {
        if (!channelMapper.existsHubChannel(mallKey)) {
            throw new ChannelNotFoundException("unsupported channel: " + mallKey);
        }
    }

    private ChannelResponse toResponse(String mallName, ChannelRow row) {
        return ChannelResponse.builder()
                .channelAccountId(row.getId())
                .corpId(row.getCorpId())
                .mallKey(row.getMallKey())
                .mallName(mallName)
                .accountName(row.getAccountName())
                .registered(true)
                .useYn(row.getUseYn())
                .mallId(mask(row.getMallId()))
                .mallPw(mask(row.getMallPw()))
                .vendorId(mask(row.getVendorId()))
                .key(mask(row.getKey()))
                .key2(mask(row.getKey2()))
                .authKey(mask(row.getAuthKey()))
                .build();
    }

    private String defaultAccountName(String value, String fallback) {
        return value == null || value.isBlank() ? fallback : value.trim();
    }

    private String mask(String value) {
        return value != null ? "****" : null;
    }

    private String encryptOrKeep(String newValue, String existingEncrypted) {
        return newValue != null && !newValue.isBlank()
                ? aesEncryptor.encrypt(newValue)
                : existingEncrypted;
    }
}
