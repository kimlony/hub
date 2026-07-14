package hub.auth.controller;

import hub.auth.HubUserPrincipal;
import hub.auth.dto.request.LoginRequest;
import hub.auth.dto.response.LoginResponse;
import hub.auth.service.AuthService;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/auth")
@RequiredArgsConstructor
public class AuthController {

    private final AuthService authService;

    @PostMapping("/login")
    public ResponseEntity<LoginResponse> login(@RequestBody LoginRequest request) {
        return ResponseEntity.ok(authService.login(request));
    }

    @GetMapping("/me/malls")
    public ResponseEntity<List<String>> myMalls(@AuthenticationPrincipal HubUserPrincipal principal) {
        return ResponseEntity.ok(authService.getMallKeys(principal.username()));
    }
}
