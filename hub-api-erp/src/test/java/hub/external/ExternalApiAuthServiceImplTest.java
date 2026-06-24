package hub.external;

import com.fasterxml.jackson.databind.ObjectMapper;
import hub.config.AesEncryptor;
import hub.config.JwtProperties;
import hub.external.domain.ExternalApiClientRow;
import hub.external.dto.response.ExternalApiTokenResponse;
import hub.external.mapper.ExternalApiClientMapper;
import hub.external.service.ExternalApiAuthServiceImpl;
import java.nio.charset.StandardCharsets;
import java.time.format.DateTimeFormatter;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.util.HexFormat;
import java.util.Optional;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.api.Test;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.Mock;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class ExternalApiAuthServiceImplTest {

    private static final String CLIENT_ID = "client-001";
    private static final String CLIENT_SECRET = "test-only-client-secret";

    @Mock
    private ExternalApiClientMapper externalApiClientMapper;

    @Mock
    private AesEncryptor aesEncryptor;

    /**
     * clientId, timestamp, signature 餓??袁⑸땾 ?紐꾩쵄揶쏅?????쑴堉???됱몵筌?token 獄쏆뮄???椰꾧퀡???롫뮉筌왖 野꺜筌앹빜釉??
     */
    @Test
    void issueTokenRejectsMissingRequiredHeaders() {
        ExternalApiAuthServiceImpl service = service();

        assertThatThrownBy(() -> service.issueToken("", timestampNow(), "signature"))
                .isInstanceOf(ExternalApiAuthException.class);
    }

    /**
     * ?源낆쨯??? ??? clientId????token 獄쏆뮄???椰꾧퀡???랁?secret 癰귣벏??遺얜즲 ??? ??낅뮉筌왖 野꺜筌앹빜釉??
     */
    @Test
    void issueTokenRejectsUnknownClientId() {
        ExternalApiAuthServiceImpl service = service();

        when(externalApiClientMapper.findByClientId(CLIENT_ID)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.issueToken(CLIENT_ID, timestampNow(), "signature"))
                .isInstanceOf(ExternalApiAuthException.class);

        verify(aesEncryptor, never()).decrypt("enc-secret");
    }

    /**
     * ??쑵???client????token 獄쏆뮄???椰꾧퀡???랁?secret 癰귣벏??遺얜즲 ??? ??낅뮉筌왖 野꺜筌앹빜釉??
     */
    @Test
    void issueTokenRejectsInactiveClient() {
        ExternalApiAuthServiceImpl service = service();
        ExternalApiClientRow client = activeClient();
        client.setStatus("DISABLED");

        when(externalApiClientMapper.findByClientId(CLIENT_ID)).thenReturn(Optional.of(client));

        assertThatThrownBy(() -> service.issueToken(CLIENT_ID, timestampNow(), "signature"))
                .isInstanceOf(ExternalApiAuthException.class);

        verify(aesEncryptor, never()).decrypt("enc-secret");
    }

    /**
     * timestamp ?類ㅻ뻼????而?몴?? ??놁몵筌?token 獄쏆뮄???椰꾧퀡???롫뮉筌왖 野꺜筌앹빜釉??
     */
    @Test
    void issueTokenRejectsInvalidTimestampFormat() {
        ExternalApiAuthServiceImpl service = service();

        when(externalApiClientMapper.findByClientId(CLIENT_ID)).thenReturn(Optional.of(activeClient()));

        assertThatThrownBy(() -> service.issueToken(CLIENT_ID, "not-a-time", "signature"))
                .isInstanceOf(ExternalApiAuthException.class);

        verify(aesEncryptor, never()).decrypt("enc-secret");
    }

    /**
     * timestamp ??됱뒠 ??볦퍢??筌왖??롢늺 replay ?⑤벀爰?獄쎻뫗????袁る퉸 token 獄쏆뮄???椰꾧퀡???롫뮉筌왖 野꺜筌앹빜釉??
     */
    @Test
    void issueTokenRejectsExpiredTimestamp() {
        ExternalApiAuthServiceImpl service = service();
        String expiredTimestamp = OffsetDateTime.now(ZoneId.of("Asia/Seoul"))
                .minusMinutes(10)
                .format(DateTimeFormatter.ISO_OFFSET_DATE_TIME);

        when(externalApiClientMapper.findByClientId(CLIENT_ID)).thenReturn(Optional.of(activeClient()));

        assertThatThrownBy(() -> service.issueToken(CLIENT_ID, expiredTimestamp, "signature"))
                .isInstanceOf(ExternalApiAuthException.class);

        verify(aesEncryptor, never()).decrypt("enc-secret");
    }

    /**
     * HMAC signature揶쎛 ??깊뒄??? ??놁몵筌?token 獄쏆뮄???椰꾧퀡???롫뮉筌왖 野꺜筌앹빜釉??
     */
    @Test
    void issueTokenRejectsInvalidSignature() {
        ExternalApiAuthServiceImpl service = service();
        String timestamp = timestampNow();

        when(externalApiClientMapper.findByClientId(CLIENT_ID)).thenReturn(Optional.of(activeClient()));
        when(aesEncryptor.decrypt("enc-secret")).thenReturn(CLIENT_SECRET);

        assertThatThrownBy(() -> service.issueToken(CLIENT_ID, timestamp, "wrong-signature"))
                .isInstanceOf(ExternalApiAuthException.class);
    }

    /**
     * ?類ㅺ맒 clientId, timestamp, HMAC signature????Bearer token??scope 筌뤴뫖以??獄쏆꼹???롫뮉筌왖 野꺜筌앹빜釉??
     */
    @Test
    void issueTokenReturnsBearerTokenWhenSignatureIsValid() {
        ExternalApiAuthServiceImpl service = service();
        String timestamp = timestampNow();
        String signature = hmacSha256Hex(CLIENT_SECRET, CLIENT_ID + "." + timestamp);

        when(externalApiClientMapper.findByClientId(CLIENT_ID)).thenReturn(Optional.of(activeClient()));
        when(aesEncryptor.decrypt("enc-secret")).thenReturn(CLIENT_SECRET);

        ExternalApiTokenResponse response = service.issueToken(CLIENT_ID, timestamp, signature);

        assertThat(response.getTokenType()).isEqualTo("Bearer");
        assertThat(response.getAccessToken()).isNotBlank();
        assertThat(response.getExpiresIn()).isEqualTo(1800);
        assertThat(response.getScopes()).containsExactly("orders:read");
    }

    private ExternalApiAuthServiceImpl service() {
        JwtProperties jwtProperties = new JwtProperties();
        jwtProperties.setSecret("test-only-jwt-secret-32-bytes!!!");
        jwtProperties.setExpiryMs(86_400_000L);
        return new ExternalApiAuthServiceImpl(
                externalApiClientMapper,
                aesEncryptor,
                jwtProperties,
                new ObjectMapper()
        );
    }

    private ExternalApiClientRow activeClient() {
        return ExternalApiClientRow.builder()
                .id(1L)
                .userId(1L)
                .clientId(CLIENT_ID)
                .clientSecretEnc("enc-secret")
                .scopesJson("[\"orders:read\"]")
                .status("ACTIVE")
                .tokenTtlSeconds(1800)
                .signatureValidSeconds(300)
                .build();
    }

    private String timestampNow() {
        return OffsetDateTime.now(ZoneId.of("Asia/Seoul")).format(DateTimeFormatter.ISO_OFFSET_DATE_TIME);
    }

    private String hmacSha256Hex(String secret, String message) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
            return HexFormat.of().formatHex(mac.doFinal(message.getBytes(StandardCharsets.UTF_8)));
        } catch (Exception exception) {
            throw new IllegalStateException(exception);
        }
    }
}
