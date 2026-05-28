package com.bizbee.hub.config;

import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.assertThat;

class AesEncryptorTest {

    private AesEncryptor encryptor() {
        AesProperties props = new AesProperties();
        props.setSecret("test-aes-secret-32-byte-value!!!");
        return new AesEncryptor(props);
    }

    @Test
    void encryptAndDecryptRoundTrip() {
        AesEncryptor enc = encryptor();
        String original = "test-api-key-12345";

        String encrypted = enc.encrypt(original);
        String decrypted = enc.decrypt(encrypted);

        assertThat(decrypted).isEqualTo(original);
        assertThat(encrypted).isNotEqualTo(original);
    }

    @Test
    void encryptProducesDifferentCiphertextEachTime() {
        AesEncryptor enc = encryptor();
        String a = enc.encrypt("same-value");
        String b = enc.encrypt("same-value");
        assertThat(a).isNotEqualTo(b);
    }

    @Test
    void encryptNullReturnsNull() {
        assertThat(encryptor().encrypt(null)).isNull();
    }

    @Test
    void decryptNullReturnsNull() {
        assertThat(encryptor().decrypt(null)).isNull();
    }
}
