package hub.config;

import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.assertThat;

class AesEncryptorTest {

    private AesEncryptor encryptor() {
        AesProperties props = new AesProperties();
        props.setSecret("test-aes-secret-32-byte-value!!!");
        return new AesEncryptor(props);
    }

    /**
     * 암호화한 값을 다시 복호화하면 원문과 같은지 검증한다.
     */
    @Test
    void encryptAndDecryptRoundTrip() {
        AesEncryptor enc = encryptor();
        String original = "test-api-key-12345";

        String encrypted = enc.encrypt(original);
        String decrypted = enc.decrypt(encrypted);

        assertThat(decrypted).isEqualTo(original);
        assertThat(encrypted).isNotEqualTo(original);
    }

    /**
     * 같은 원문도 매번 다른 암호문으로 생성되는지 검증한다.
     */
    @Test
    void encryptProducesDifferentCiphertextEachTime() {
        AesEncryptor enc = encryptor();
        String a = enc.encrypt("same-value");
        String b = enc.encrypt("same-value");
        assertThat(a).isNotEqualTo(b);
    }

    /**
     * null을 암호화하면 null을 반환하는지 검증한다.
     */
    @Test
    void encryptNullReturnsNull() {
        assertThat(encryptor().encrypt(null)).isNull();
    }

    /**
     * null을 복호화하면 null을 반환하는지 검증한다.
     */
    @Test
    void decryptNullReturnsNull() {
        assertThat(encryptor().decrypt(null)).isNull();
    }
}
