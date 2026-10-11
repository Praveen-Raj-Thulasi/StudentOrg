# ─────────────────────────────────────────────────────────────────────────────
# EventBookingSystem — Backend Dockerfile
# Target: Zoho Catalyst AppSail (Catalyst-Managed Runtime or Custom Runtime)
#
# Build stage: compiles the Spring Boot fat JAR with Maven.
# Run stage:   executes the JAR, reading X_ZOHO_CATALYST_LISTEN_PORT from
#              Catalyst's environment at runtime.
#
# LOCAL BUILD & RUN (for testing the image locally):
#   docker build -t event-booking-backend .
#   docker run -p 8080:8080 --env-file ../.env event-booking-backend
#
# DO NOT put real credentials in this file.
# All secrets must be provided via environment variables at runtime.
# ─────────────────────────────────────────────────────────────────────────────

# ── Stage 1: Build ────────────────────────────────────────────────────────────
FROM maven:3.9.6-eclipse-temurin-21 AS build

WORKDIR /app

# Copy pom first — lets Docker cache the dependency layer
COPY pom.xml .
RUN mvn dependency:go-offline -q

# Copy source and build
COPY src ./src
RUN mvn clean package -DskipTests -q

# ── Stage 2: Run ──────────────────────────────────────────────────────────────
FROM eclipse-temurin:21-jre-alpine

WORKDIR /app

# Copy the fat JAR from build stage
COPY --from=build /app/target/event-booking-system-1.0.0.jar app.jar

# Create the uploads directory (note: on Catalyst AppSail, the filesystem is
# read-only except for the OS temp dir. File uploads will fail silently unless
# you configure cloud storage. See DEPLOY_ZOHO_CATALYST.md for details.)
RUN mkdir -p uploads

# Catalyst AppSail injects X_ZOHO_CATALYST_LISTEN_PORT at runtime.
# application.yml reads: ${X_ZOHO_CATALYST_LISTEN_PORT:${PORT:8080}}
# so this EXPOSE is informational only — Catalyst manages the actual port.
EXPOSE 8080

ENTRYPOINT ["java", "-jar", "app.jar"]
