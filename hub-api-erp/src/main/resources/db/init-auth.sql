CREATE TABLE IF NOT EXISTS hub_corp (
    id         BIGSERIAL PRIMARY KEY,
    corp_cd    VARCHAR(50) UNIQUE NOT NULL,
    corp_name  VARCHAR(200) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS users (
    id         BIGSERIAL PRIMARY KEY,
    corp_id    BIGINT REFERENCES hub_corp(id),
    username   VARCHAR(50)  UNIQUE NOT NULL,
    password   VARCHAR(60)  NOT NULL,
    created_at TIMESTAMPTZ  DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_malls (
    id        BIGSERIAL PRIMARY KEY,
    corp_id   BIGINT REFERENCES hub_corp(id),
    user_id   BIGINT      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    mall_key  VARCHAR(20) NOT NULL,
    account_name VARCHAR(100),
    key       VARCHAR(500),
    key2      VARCHAR(500),
    auth_key  VARCHAR(500),
    mall_id   VARCHAR(255),
    mall_pw   VARCHAR(500),
    use_yn    CHAR(1)     NOT NULL DEFAULT 'Y',
    vendor_id VARCHAR(500)
);

-- 포트폴리오 공개 저장소에는 기본 관리자 계정을 포함하지 않습니다.
-- 로컬 테스트 계정은 각 환경에서 BCrypt 해시를 생성해 직접 등록하세요.
-- user_malls 시드 없음: 채널 자격증명은 사용자가 채널 관리 UI에서 직접 등록
