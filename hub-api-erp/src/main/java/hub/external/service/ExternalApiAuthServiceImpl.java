package hub.external.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import hub.config.AesEncryptor;
import hub.config.JwtProperties;
import hub.external.domain.ExternalApiClientRow;
import hub.external.dto.response.ExternalApiTokenResponse;
import hub.external.ExternalApiAuthException;
import hub.external.mapper.ExternalApiClientMapper;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Duration;
import java.time.format.DateTimeFormatter;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.util.Date;
import java.util.HexFormat;
import java.util.List;
import javax.crypto.Mac;
import javax.crypto.SecretKey;
import javax.crypto.spec.SecretKeySpec;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class ExternalApiAuthServiceImpl implements ExternalApiAuthService {

    private static final TypeReference<List<String>> STRING_LIST_TYPE = new TypeReference<>() {};
    private static final String TOKEN_TYPE = "EXTERNAL";
    private static final ZoneId KST = ZoneId.of("Asia/Seoul");
    private static final DateTimeFormatter COMPACT_KST_FORMATTER = DateTimeFormatter.ofPattern("yyyyMMddHHmmss");

    private final ExternalApiClientMapper externalApiClientMapper;
    private final AesEncryptor aesEncryptor;
    private final JwtProperties jwtProperties;
    private final ObjectMapper objectMapper;

    @Override
    public ExternalApiTokenResponse issueToken(String clientId, String timestamp, String signature) {
        if (isBlank(clientId) || isBlank(timestamp) || isBlank(signature)) {
            throw new ExternalApiAuthException("?熬곣뫖???筌뤾쑴理????녹맠?띠럾? ?熬곣뫁逾??琉????鍮??");
        }

        ExternalApiClientRow client = externalApiClientMapper.findByClientId(clientId)
                .orElseThrow(() -> new ExternalApiAuthException("?繹먮굞夷??? ??? clientId???낅퉵??"));
        if (!"ACTIVE".equals(client.getStatus())) {
            throw new ExternalApiAuthException("?????繹먮봿?????????怨룹꽘?筌뤾쑴肉???덈펲.");
        }

        validateTimestamp(timestamp, client.getSignatureValidSeconds());

        String clientSecret = aesEncryptor.decrypt(client.getClientSecretEnc());
        // The signature binds the client id and timestamp to the secret, which
        // prevents a leaked token request from being replayed outside the window.
        String expectedSignature = hmacSha256Hex(clientSecret, clientId + "." + timestamp);
        if (!constantTimeEquals(expectedSignature, signature)) {
            throw new ExternalApiAuthException("??類ㅺ뎄??????紐?? ???용????덈펲.");
        }

        List<String> scopes = readStringList(client.getScopesJson());
        int expiresIn = client.getTokenTtlSeconds() == null ? 1800 : client.getTokenTtlSeconds();
        String accessToken = generateExternalJwt(client, scopes, expiresIn);

        return ExternalApiTokenResponse.builder()
                .accessToken(accessToken)
                .tokenType("Bearer")
                .expiresIn(expiresIn)
                .scopes(scopes)
                .build();
    }

    private void validateTimestamp(String timestamp, Integer validSeconds) {
        Instant requestedAt = parseTimestamp(timestamp);
        if (requestedAt == null) {
            throw new ExternalApiAuthException("timestamp ?筌먦끇六??????紐?? ???용????덈펲.");
        }

        long allowedSeconds = validSeconds == null || validSeconds <= 0 ? 300 : validSeconds;
        Duration diff = Duration.between(requestedAt, Instant.now()).abs();
        if (diff.getSeconds() > allowedSeconds) {
            throw new ExternalApiAuthException("timestamp ???깅뮔 ??蹂?뜟??嶺뚮씭??쭩??琉????鍮??");
        }
    }

    private Instant parseTimestamp(String timestamp) {
        try {
            return OffsetDateTime.parse(timestamp).toInstant();
        } catch (Exception ignored) {
            // Continue with KST-only formats below.
        }
        try {
            return LocalDateTime.parse(timestamp).atZone(KST).toInstant();
        } catch (Exception ignored) {
            // Continue with compact KST format below.
        }
        try {
            return LocalDateTime.parse(timestamp, COMPACT_KST_FORMATTER).atZone(KST).toInstant();
        } catch (Exception ignored) {
            return null;
        }
    }

    private String hmacSha256Hex(String secret, String message) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
            return HexFormat.of().formatHex(mac.doFinal(message.getBytes(StandardCharsets.UTF_8)));
        } catch (Exception e) {
            throw new IllegalStateException("HMAC ??類ㅺ뎄 ??諛댁뎽?????덉넮???곕????덈펲.", e);
        }
    }

    private boolean constantTimeEquals(String expected, String actual) {
        byte[] expectedBytes = expected.getBytes(StandardCharsets.UTF_8);
        byte[] actualBytes = actual.toLowerCase().getBytes(StandardCharsets.UTF_8);
        return MessageDigest.isEqual(expectedBytes, actualBytes);
    }

    private String generateExternalJwt(ExternalApiClientRow client, List<String> scopes, int expiresIn) {
        long now = System.currentTimeMillis();
        SecretKey key = Keys.hmacShaKeyFor(jwtProperties.getSecret().getBytes(StandardCharsets.UTF_8));
        return Jwts.builder()
                .subject(client.getClientId())
                .claim("type", TOKEN_TYPE)
                .claim("clientId", client.getClientId())
                .claim("userId", client.getUserId())
                .claim("scopes", scopes)
                .issuedAt(new Date(now))
                .expiration(new Date(now + expiresIn * 1000L))
                .signWith(key)
                .compact();
    }

    private List<String> readStringList(String json) {
        if (json == null || json.isBlank()) {
            return List.of();
        }
        try {
            return objectMapper.readValue(json, STRING_LIST_TYPE);
        } catch (JsonProcessingException e) {
            return List.of();
        }
    }

    private boolean isBlank(String value) {
        return value == null || value.isBlank();
    }
}
