package hub.channel;

import hub.auth.domain.HubUser;
import hub.auth.mapper.UserMapper;
import hub.channel.domain.ChannelRow;
import hub.channel.dto.request.ChannelRequest;
import hub.channel.mapper.ChannelMapper;
import hub.channel.service.ChannelServiceImpl;
import hub.config.AesEncryptor;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class ChannelServiceImplTest {

    @Mock
    private ChannelMapper channelMapper;

    @Mock
    private UserMapper userMapper;

    @Mock
    private AesEncryptor aesEncryptor;

    private ChannelServiceImpl channelService;

    @BeforeEach
    void setUp() {
        channelService = new ChannelServiceImpl(channelMapper, userMapper, aesEncryptor);
    }

    /**
     * 다른 회사 사용자가 채널 계정을 수정하지 못하는지 검증한다.
     */
    @Test
    void userCannotUpdateChannelAccountOwnedByAnotherCorp() {
        HubUser user = user(2L, 200L, "corp-b-user");
        ChannelRequest request = request("unauthorized update");

        when(userMapper.findByUsername("corp-b-user")).thenReturn(Optional.of(user));
        when(channelMapper.findByCorpIdAndId(200L, 10L)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> channelService.update("corp-b-user", 10L, request))
                .isInstanceOf(ChannelNotFoundException.class)
                .hasMessage("channel account not found: 10");

        verify(channelMapper).findByCorpIdAndId(200L, 10L);
        verify(channelMapper, never()).update(org.mockito.ArgumentMatchers.any(ChannelRow.class));
    }

    /**
     * 같은 회사가 동일 채널에 여러 판매자 계정을 등록할 수 있는지 검증한다.
     */
    @Test
    void sameCorpCanRegisterMultipleSellerAccountsForSameChannel() {
        HubUser user = user(1L, 100L, "corp-a-user");
        when(userMapper.findByUsername("corp-a-user")).thenReturn(Optional.of(user));
        when(channelMapper.existsHubChannel("GODO")).thenReturn(true);

        channelService.register("corp-a-user", "GODO", request("GODO main"));
        channelService.register("corp-a-user", "GODO", request("GODO outlet"));

        ArgumentCaptor<ChannelRow> captor = ArgumentCaptor.forClass(ChannelRow.class);
        verify(channelMapper, times(2)).insert(captor.capture());
        List<ChannelRow> inserted = captor.getAllValues();

        assertThat(inserted).extracting(ChannelRow::getCorpId).containsOnly(100L);
        assertThat(inserted).extracting(ChannelRow::getUserId).containsOnly(1L);
        assertThat(inserted).extracting(ChannelRow::getMallKey).containsOnly("GODO");
        assertThat(inserted).extracting(ChannelRow::getAccountName)
                .containsExactly("GODO main", "GODO outlet");
    }

    private HubUser user(Long userId, Long corpId, String username) {
        HubUser user = new HubUser();
        user.setId(userId);
        user.setCorpId(corpId);
        user.setUsername(username);
        return user;
    }

    private ChannelRequest request(String accountName) {
        ChannelRequest request = new ChannelRequest();
        ReflectionTestUtils.setField(request, "accountName", accountName);
        return request;
    }
}
