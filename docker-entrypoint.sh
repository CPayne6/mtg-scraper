#!/bin/sh
set -e

# Load Docker Secrets into environment variables
# This runs BEFORE the Node.js application starts, making secrets transparent to the app
if [ "$USE_DOCKER_SECRETS" = "true" ] && [ -d "/run/secrets" ]; then
    echo "Loading Docker Secrets into environment variables..."

    # Get service name from environment (api, scraper, scheduler, etc.)
    # This must be set in docker-compose.yml as SERVICE_NAME environment variable
    if [ -z "$SERVICE_NAME" ]; then
        echo "ERROR: SERVICE_NAME environment variable not set"
        exit 1
    fi

    SERVICE_PREFIX="${SERVICE_NAME}_"
    secrets_loaded=0

    # Loop through all secrets in /run/secrets
    for secret_file in /run/secrets/*; do
        if [ -f "$secret_file" ]; then
            secret_name=$(basename "$secret_file")
            secret_value=$(cat "$secret_file")

            # Handle service-specific secrets (e.g., api_database_password)
            if echo "$secret_name" | grep -q "^${SERVICE_PREFIX}"; then
                # Remove service prefix and convert to uppercase
                # e.g., api_database_password -> DATABASE_PASSWORD
                env_var_name=$(echo "$secret_name" | sed "s/^${SERVICE_PREFIX}//" | tr '[:lower:]' '[:upper:]')

                # Only set if not already set (existing env vars take precedence)
                if [ -z "$(eval echo \$$env_var_name)" ]; then
                    export "$env_var_name=$secret_value"
                    echo "  ✓ Loaded secret: $secret_name -> $env_var_name"
                    secrets_loaded=$((secrets_loaded + 1))
                fi
            fi

            # Handle global secrets (no underscore in name, e.g., postgres_password)
            if ! echo "$secret_name" | grep -q "_"; then
                env_var_name=$(echo "$secret_name" | tr '[:lower:]' '[:upper:]')

                if [ -z "$(eval echo \$$env_var_name)" ]; then
                    export "$env_var_name=$secret_value"
                    echo "  ✓ Loaded global secret: $secret_name -> $env_var_name"
                    secrets_loaded=$((secrets_loaded + 1))
                fi
            fi
        fi
    done

    echo "Loaded $secrets_loaded secrets from Docker Swarm"
else
    echo "Docker Secrets disabled or not available, using environment variables"
fi

# Execute the main command (node dist/main.js)
exec "$@"
