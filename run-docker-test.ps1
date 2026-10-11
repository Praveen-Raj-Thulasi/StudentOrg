# Pass database and API credentials through your PowerShell environment; never store them here.
$required = @('DB_HOST', 'DB_PORT', 'DB_NAME', 'DB_USERNAME', 'DB_PASSWORD', 'JWT_SECRET')
foreach ($name in $required) {
  if (-not [Environment]::GetEnvironmentVariable($name)) {
    throw "Set the $name environment variable before running this container."
  }
}

docker run --rm -p 8081:8080 `
  -e DB_HOST `
  -e DB_PORT `
  -e DB_NAME `
  -e DB_USERNAME `
  -e DB_PASSWORD `
  -e DB_USE_SSL=true `
  -e DB_REQUIRE_SSL=true `
  -e JWT_SECRET `
  -e GEMINI_API_KEY `
  -e GEMINI_MODEL=gemini-2.5-flash `
  -e MONGODB_ENABLED=false `
  -e UPLOAD_DIR=/tmp/uploads `
  -e LOG_FILE=/tmp/event-booking.log `
  event-booking-backend:latest
