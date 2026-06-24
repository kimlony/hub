package hub.config;

import hub.exception.HubUnauthorizedException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.HandlerInterceptor;

@Component
@RequiredArgsConstructor
public class HubApiKeyInterceptor implements HandlerInterceptor {

    private final HubSecurityProperties hubSecurityProperties;

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) {
        if (!hubSecurityProperties.enabled()) {
            return true;
        }

        String actualApiKey = request.getHeader(hubSecurityProperties.headerName());
        if (hubSecurityProperties.apiKey() == null || !hubSecurityProperties.apiKey().equals(actualApiKey)) {
            throw new HubUnauthorizedException("Invalid HUB API key");
        }

        return true;
    }
}
