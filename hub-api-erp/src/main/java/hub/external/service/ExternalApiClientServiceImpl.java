package hub.external.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import hub.auth.AuthException;
import hub.auth.domain.HubUser;
import hub.auth.mapper.UserMapper;
import hub.config.AesEncryptor;
import hub.external.domain.ExternalApiClientRow;
import hub.external.dto.request.ExternalApiClientCreateRequest;
import hub.external.dto.response.ExternalApiClientCreateResponse;
import hub.external.dto.response.ExternalApiClientResponse;
import hub.external.mapper.ExternalApiClientMapper;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.Base64;
import java.util.List;
import java.util.Locale;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class ExternalApiClientServiceImpl implements ExternalApiClientService {

    private static final SecureRandom SECURE_RANDOM = new SecureRandom();
    private static final TypeReference<List<String>> STRING_LIST_TYPE = new TypeReference<>() {};
    private static final int DEFAULT_TOKEN_TTL_SECONDS = 1800;
    private static final int DEFAULT_SIGNATURE_VALID_SECONDS = 300;

    private final ExternalApiClientMapper externalApiClientMapper;
    private final UserMapper userMapper;
    private final AesEncryptor aesEncryptor;
    private final ObjectMapper objectMapper;

    @Override
    public List<ExternalApiClientResponse> getClients(String username) {
        HubUser user = findUser(username);
        return externalApiClientMapper.findByUserId(user.getId()).stream()
                .map(this::toResponse)
                .toList();
    }

    @Override
    @Transactional
    public ExternalApiClientCreateResponse createClient(String username, ExternalApiClientCreateRequest request) {
        HubUser user = findUser(username);
        List<String> scopes = normalizeScopes(request.getScopes());
        List<String> allowedIps = request.getAllowedIps() == null ? List.of() : request.getAllowedIps();
        String clientId = generateUniqueClientId(user.getId());
        String clientSecret = generateClientSecret();

        // The raw secret is returned only once. The database stores an encrypted
        // copy for HMAC validation and a fingerprint for future rotation/audit.
        ExternalApiClientRow row = ExternalApiClientRow.builder()
                .userId(user.getId())
                .clientName(request.getClientName().trim())
                .clientId(clientId)
                .clientSecretEnc(aesEncryptor.encrypt(clientSecret))
                .clientSecretFingerprint(sha256Hex(clientSecret))
                .scopesJson(toJson(scopes))
                .status("ACTIVE")
                .tokenTtlSeconds(valueOrDefault(request.getTokenTtlSeconds(), DEFAULT_TOKEN_TTL_SECONDS))
                .signatureValidSeconds(valueOrDefault(request.getSignatureValidSeconds(), DEFAULT_SIGNATURE_VALID_SECONDS))
                .allowedIpsJson(toJson(allowedIps))
                .build();

        externalApiClientMapper.insert(row);

        return ExternalApiClientCreateResponse.builder()
                .client(toResponse(row))
                .clientSecret(clientSecret)
                .warning("clientSecret?? 嶺뚣끉裕???꾩룇裕????얜Ŧ堉????ｇ춯???戮?뻣??紐껊퉵?? ?釉뚯뫒???濡?듆 ???뚯궏臾???????紐껊퉵??")
                .build();
    }

    private HubUser findUser(String username) {
        return userMapper.findByUsername(username)
                .orElseThrow(() -> new AuthException("?????? 嶺뚢돦堉??????怨룸????덈펲."));
    }

    private String generateUniqueClientId(Long userId) {
        for (int i = 0; i < 5; i++) {
            String candidate = "client_" + userId + "_" + randomUrlToken(12).toLowerCase(Locale.ROOT);
            if (externalApiClientMapper.findByUserIdAndClientId(userId, candidate).isEmpty()) {
                return candidate;
            }
        }
        throw new IllegalStateException("clientId ??諛댁뎽?????덉넮???곕????덈펲.");
    }

    private String generateClientSecret() {
        return "bzb_" + randomUrlToken(32);
    }

    private String randomUrlToken(int byteLength) {
        byte[] bytes = new byte[byteLength];
        SECURE_RANDOM.nextBytes(bytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }

    private String sha256Hex(String value) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] hashed = digest.digest(value.getBytes(StandardCharsets.UTF_8));
            StringBuilder sb = new StringBuilder(hashed.length * 2);
            for (byte b : hashed) {
                sb.append(String.format("%02x", b));
            }
            return sb.toString();
        } catch (Exception e) {
            throw new IllegalStateException("clientSecret fingerprint ??諛댁뎽?????덉넮???곕????덈펲.", e);
        }
    }

    private List<String> normalizeScopes(List<String> scopes) {
        if (scopes == null || scopes.isEmpty()) {
            return List.of("orders:read");
        }
        return scopes.stream()
                .filter(scope -> scope != null && !scope.isBlank())
                .map(String::trim)
                .distinct()
                .toList();
    }

    private int valueOrDefault(Integer value, int defaultValue) {
        return value == null || value <= 0 ? defaultValue : value;
    }

    private String toJson(List<String> values) {
        try {
            return objectMapper.writeValueAsString(values == null ? List.of() : values);
        } catch (JsonProcessingException e) {
            throw new IllegalArgumentException("JSON ?곌떠???琉욱뱺 ???덉넮???곕????덈펲.", e);
        }
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

    private ExternalApiClientResponse toResponse(ExternalApiClientRow row) {
        return ExternalApiClientResponse.builder()
                .id(row.getId())
                .clientName(row.getClientName())
                .clientId(row.getClientId())
                .scopes(readStringList(row.getScopesJson()))
                .status(row.getStatus())
                .tokenTtlSeconds(row.getTokenTtlSeconds())
                .signatureValidSeconds(row.getSignatureValidSeconds())
                .allowedIps(readStringList(row.getAllowedIpsJson()))
                .lastCalledAt(row.getLastCalledAt())
                .secretRotatedAt(row.getSecretRotatedAt())
                .disabledAt(row.getDisabledAt())
                .createdAt(row.getCreatedAt())
                .updatedAt(row.getUpdatedAt())
                .build();
    }
}
