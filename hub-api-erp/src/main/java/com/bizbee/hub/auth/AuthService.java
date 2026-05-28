package com.bizbee.hub.auth;

import java.util.List;

public interface AuthService {
    LoginResponse login(LoginRequest request);
    List<String>  getMallKeys(String username);
}
