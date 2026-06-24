package hub.config;

import lombok.RequiredArgsConstructor;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

@Configuration
@RequiredArgsConstructor
@EnableConfigurationProperties(HubSecurityProperties.class)
public class WebConfig implements WebMvcConfigurer {

    private final HubApiKeyInterceptor hubApiKeyInterceptor;

    @Override
    public void addInterceptors(InterceptorRegistry registry) {
        registry.addInterceptor(hubApiKeyInterceptor)
                .addPathPatterns("/api/hub/jobs", "/api/hub/jobs/**")
                .excludePathPatterns(
                        "/error",
                        "/api/hub/jobs",
                        "/api/hub/jobs/dashboard",
                        "/api/hub/jobs/batch",
                        "/api/hub/jobs/*/logs",
                        "/api/hub/jobs/*/retry"
                );
    }
}
