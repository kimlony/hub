package hub.config;

import hub.external.ExternalApiAuthFilter;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.beans.factory.InitializingBean;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

@Configuration
@EnableWebSecurity
@RequiredArgsConstructor
@EnableConfigurationProperties({UiJwtProperties.class, ExternalJwtProperties.class, AesProperties.class})
public class SecurityConfig {

    private final JwtAuthFilter jwtAuthFilter;
    private final ExternalApiAuthFilter externalApiAuthFilter;

    @Bean
    public SecurityFilterChain filterChain(HttpSecurity http) throws Exception {
        http
            .csrf(AbstractHttpConfigurer::disable)
            .cors(cors -> cors.configurationSource(corsConfigurationSource()))
            .sessionManagement(sm -> sm.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
            .authorizeHttpRequests(auth -> auth
                .requestMatchers("/api/auth/login").permitAll()
                .requestMatchers("/api/external/auth/token").permitAll()
                .requestMatchers("/api/external/orders/**").authenticated()
                .requestMatchers("/api/hub/load-tests/**").hasRole("SYSTEM_ADMIN")
                .requestMatchers("/api/hub/kafka/**").hasRole("SYSTEM_ADMIN")
                .requestMatchers("/api/hub/workers/**").hasRole("SYSTEM_ADMIN")
                .requestMatchers("/api/hub/outbox/**").hasRole("SYSTEM_ADMIN")
                .requestMatchers("/api/admin/**").hasRole("SYSTEM_ADMIN")
                .requestMatchers("/api/auth/me/**").authenticated()
                .requestMatchers("/api/channels/**").authenticated()
                .requestMatchers("/api/hub/**").authenticated()
                .requestMatchers("/api/orders/export/**").authenticated()
                .requestMatchers("/api/**").denyAll()
                .anyRequest().permitAll()
            )
            .addFilterBefore(externalApiAuthFilter, UsernamePasswordAuthenticationFilter.class)
            .addFilterBefore(jwtAuthFilter, UsernamePasswordAuthenticationFilter.class);
        return http.build();
    }

    @Bean
    public PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder();
    }

    @Bean
    public InitializingBean jwtSecretsMustBeDistinct(
            UiJwtProperties uiProperties,
            ExternalJwtProperties externalProperties
    ) {
        return () -> {
            if (uiProperties.getSecret().equals(externalProperties.getSecret())) {
                throw new IllegalStateException("UI and external JWT secrets must be different");
            }
        };
    }

    @Bean
    public CorsConfigurationSource corsConfigurationSource() {
        CorsConfiguration config = new CorsConfiguration();
        config.setAllowedOrigins(List.of(
            "http://localhost:5173",
            "https://hub.rony.kr"
        ));
        config.setAllowedMethods(List.of("GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"));
        config.setAllowedHeaders(List.of("*"));
        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/api/**", config);
        return source;
    }
}
