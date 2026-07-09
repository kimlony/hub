package hub.config;

import hub.external.ExternalApiAuthFilter;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
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
@EnableConfigurationProperties({JwtProperties.class, AesProperties.class})
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
                .requestMatchers("/api/external/orders/**").permitAll()
                .requestMatchers("/api/external/**").authenticated()
                .requestMatchers("/api/auth/me/**").authenticated()
                .requestMatchers("/api/channels/**").authenticated()
                .requestMatchers("/api/hub/jobs/**").authenticated()
                .requestMatchers("/api/hub/erp/**").authenticated()
                .requestMatchers("/api/hub/settings/**").authenticated()
                .requestMatchers("/api/hub/schedules/**").authenticated()
                .requestMatchers("/api/hub/status-sync-schedules/**").authenticated()
                .requestMatchers("/api/hub/orders/**").authenticated()
                .requestMatchers("/api/hub/external/**").authenticated()
                .requestMatchers("/api/hub/notices/**").authenticated()
                .requestMatchers("/api/hub/news/**").authenticated()
                .requestMatchers("/api/hub/load-tests/**").hasRole("SYSTEM_ADMIN")
                .requestMatchers("/api/hub/kafka/**").hasRole("SYSTEM_ADMIN")
                .requestMatchers("/api/hub/workers/**").hasRole("SYSTEM_ADMIN")
                .requestMatchers("/api/hub/outbox/**").hasRole("SYSTEM_ADMIN")
                .requestMatchers("/api/admin/**").hasRole("SYSTEM_ADMIN")
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
    public CorsConfigurationSource corsConfigurationSource() {
        CorsConfiguration config = new CorsConfiguration();
        config.setAllowedOrigins(List.of("http://localhost:5173"));
        config.setAllowedMethods(List.of("GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"));
        config.setAllowedHeaders(List.of("*"));
        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/api/**", config);
        return source;
    }
}
