package hub.auth.service;

import hub.auth.AuthException;
import hub.auth.domain.HubUser;
import hub.auth.dto.request.LoginRequest;
import hub.auth.dto.response.LoginResponse;
import hub.auth.mapper.UserMapper;
import hub.config.JwtProvider;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

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
                .orElseThrow(() -> new AuthException("?熬곣뫗逾?????裕??????뺢퀡???먯쾸? ????紐?? ???용????덈펲."));

        if (!passwordEncoder.matches(request.getPassword(), user.getPassword())) {
            throw new AuthException("?熬곣뫗逾?????裕??????뺢퀡???먯쾸? ????紐?? ???용????덈펲.");
        }

        String token = jwtProvider.generate(user.getUsername());
        return new LoginResponse(token, user.getUsername());
    }

    @Override
    public List<String> getMallKeys(String username) {
        HubUser user = userMapper.findByUsername(username)
                .orElseThrow(() -> new AuthException("?????? 嶺뚢돦堉??????怨룸????덈펲."));
        return userMapper.findMallKeysByUserId(user.getId());
    }
}
