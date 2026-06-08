package com.bizbee.hub.external;

import com.bizbee.hub.config.AesEncryptor;
import com.bizbee.hub.config.JwtProperties;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import javax.crypto.Mac;
import javax.crypto.SecretKey;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.Date;
import java.util.HexFormat;
import java.util.List;

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
            throw new ExternalApiAuthException("필수 인증 헤더가 누락되었습니다.");
        }

        ExternalApiClientRow client = externalApiClientMapper.findByClientId(clientId)
                .orElseThrow(() -> new ExternalApiAuthException("등록되지 않은 clientId입니다."));
        if (!"ACTIVE".equals(client.getStatus())) {
            throw new ExternalApiAuthException("비활성화된 클라이언트입니다.");
        }

        validateTimestamp(timestamp, client.getSignatureValidSeconds());

        String clientSecret = aesEncryptor.decrypt(client.getClientSecretEnc());
        // The signature binds the client id and timestamp to the secret, which
        // prevents a leaked token request from being replayed outside the window.
        String expectedSignature = hmacSha256Hex(clientSecret, clientId + "." + timestamp);
        if (!constantTimeEquals(expectedSignature, signature)) {
            throw new ExternalApiAuthException("서명이 올바르지 않습니다.");
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
            throw new ExternalApiAuthException("timestamp 형식이 올바르지 않습니다.");
        }

        long allowedSeconds = validSeconds == null || validSeconds <= 0 ? 300 : validSeconds;
        Duration diff = Duration.between(requestedAt, Instant.now()).abs();
        if (diff.getSeconds() > allowedSeconds) {
            throw new ExternalApiAuthException("timestamp 허용 시간이 만료되었습니다.");
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
            throw new IllegalStateException("HMAC 서명 생성에 실패했습니다.", e);
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
