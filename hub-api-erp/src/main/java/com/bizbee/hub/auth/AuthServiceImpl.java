package com.bizbee.hub.auth;

import com.bizbee.hub.config.JwtProvider;
import lombok.RequiredArgsConstructor;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class AuthServiceImpl implements AuthService {

    private final UserMapper      userMapper;
    private final JwtProvider     jwtProvider;
    private final PasswordEncoder passwordEncoder;

    @Override
    public LoginResponse login(LoginRequest request) {
        HubUser user = userMapper.findByUsername(request.getUsername())
                .orElseThrow(() -> new AuthException("아이디 또는 비밀번호가 올바르지 않습니다."));

        if (!passwordEncoder.matches(request.getPassword(), user.getPassword())) {
            throw new AuthException("아이디 또는 비밀번호가 올바르지 않습니다.");
        }

        String token = jwtProvider.generate(user.getUsername());
        return new LoginResponse(token, user.getUsername());
    }

    @Override
    public List<String> getMallKeys(String username) {
        HubUser user = userMapper.findByUsername(username)
                .orElseThrow(() -> new AuthException("사용자를 찾을 수 없습니다."));
        return userMapper.findMallKeysByUserId(user.getId());
    }
}
