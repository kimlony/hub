CREATE TABLE IF NOT EXISTS users (
    id         BIGSERIAL PRIMARY KEY,
    username   VARCHAR(50)  UNIQUE NOT NULL,
    password   VARCHAR(60)  NOT NULL,
    created_at TIMESTAMPTZ  DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_malls (
    user_id   BIGINT      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    mall_key  VARCHAR(20) NOT NULL,
    key       VARCHAR(500),
    key2      VARCHAR(500),
    auth_key  VARCHAR(500),
    mall_id   VARCHAR(255),
    mall_pw   VARCHAR(500),
    use_yn    CHAR(1)     NOT NULL DEFAULT 'Y',
    vendor_id VARCHAR(500),
    PRIMARY KEY (user_id, mall_key)
);

-- 시드 데이터
INSERT INTO users (username, password)
VALUES ('admin', '$2a$10$Sztjtnpoc2U0Owgasj/7g.0cbJm7aQM4/201FVx9tvihFL3S87mvS')
ON CONFLICT (username) DO NOTHING;

-- user_malls 시드 없음: 채널 자격증명은 사용자가 채널 관리 UI에서 직접 등록
