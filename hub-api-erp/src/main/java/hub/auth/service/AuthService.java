package hub.auth.service;

import hub.auth.dto.request.LoginRequest;
import hub.auth.dto.response.LoginResponse;
import java.util.List;

public interface AuthService {
    LoginResponse login(LoginRequest request);
    List<String>  getMallKeys(String username);
}
