-- 실행 순서: init-auth.sql (CREATE TABLE) 이후에 실행
-- 자격증명 컬럼(key, key2, auth_key, mall_id, mall_pw)은 AES-256 암호화 값 저장 (base64, 최대 ~340자)
-- 기존 시드 데이터 행은 자격증명 없이 삽입되므로 nullable 유지
ALTER TABLE user_malls
    ADD COLUMN IF NOT EXISTS key       VARCHAR(500),
    ADD COLUMN IF NOT EXISTS key2      VARCHAR(500),
    ADD COLUMN IF NOT EXISTS auth_key  VARCHAR(500),
    ADD COLUMN IF NOT EXISTS mall_id   VARCHAR(255),
    ADD COLUMN IF NOT EXISTS mall_pw   VARCHAR(500),
    ADD COLUMN IF NOT EXISTS use_yn    CHAR(1) NOT NULL DEFAULT 'Y',
    ADD COLUMN IF NOT EXISTS vendor_id VARCHAR(500);
