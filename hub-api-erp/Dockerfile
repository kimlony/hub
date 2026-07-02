FROM node:20-alpine AS frontend-builder

WORKDIR /frontend

COPY src/main/frontend/package*.json ./
RUN npm ci

COPY src/main/frontend/ ./
RUN npm run build

FROM eclipse-temurin:17-jdk-alpine AS api-builder

WORKDIR /workspace

COPY gradlew gradlew.bat settings.gradle build.gradle ./
COPY gradle ./gradle
COPY src ./src
COPY --from=frontend-builder /frontend/dist ./src/main/resources/static

RUN chmod +x ./gradlew && ./gradlew bootJar -x test --no-daemon

FROM eclipse-temurin:17-jre-alpine AS runner

WORKDIR /app

ENV SERVER_PORT=3000
EXPOSE 3000

COPY --from=api-builder /workspace/build/libs/*.jar /app/app.jar

ENTRYPOINT ["java", "-jar", "/app/app.jar"]
