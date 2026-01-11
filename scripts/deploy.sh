#!/usr/bin/env bash
set -eu

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
PROJECT_DIR="${PROJECT_DIR:-/home/deploy/mtg-scraper}"
COMPOSE_FILE="${PROJECT_DIR}/docker-compose.prod.yml"
BACKUP_DIR="${PROJECT_DIR}/backups"
STACK_NAME="scoutlgs"
MAX_WAIT_TIME=120  # seconds
HEALTH_CHECK_RETRIES=6
HEALTH_CHECK_INTERVAL=10

# Logging functions
log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Function to validate required Docker secrets exist
validate_secrets() {
    log_info "Validating required secrets exist..."

    REQUIRED_SECRETS=(
        "postgres_password"
        "cloudflare_tunnel_token"
        "api_frontend_url"
        "api_database_password"
        "ui_vite_api_url"
        "scraper_database_password"
        "scraper_webshare_username"
        "scraper_webshare_password"
    )

    MISSING_SECRETS=()
    for secret in "${REQUIRED_SECRETS[@]}"; do
        if ! docker secret inspect "$secret" > /dev/null 2>&1; then
            MISSING_SECRETS+=("$secret")
        fi
    done

    if [ ${#MISSING_SECRETS[@]} -gt 0 ]; then
        log_error "Missing required secrets:"
        for secret in "${MISSING_SECRETS[@]}"; do
            log_error "  - $secret"
        done
        log_error "Create secrets using: scripts/setup-secrets.sh"
        exit 1
    fi

    log_info "All required secrets exist"
}

# Function to check if a service is healthy via Docker Swarm
check_service_health() {
    local service=$1
    local full_service_name="${STACK_NAME}_${service}"

    log_info "Checking health of $full_service_name"

    for i in $(seq 1 $HEALTH_CHECK_RETRIES); do
        # Check if service has running replicas
        local replicas=$(docker service ls --filter "name=${full_service_name}" --format "{{.Replicas}}" 2>/dev/null)

        if [ -n "$replicas" ]; then
            local current=$(echo "$replicas" | cut -d'/' -f1)
            local desired=$(echo "$replicas" | cut -d'/' -f2)

            if [ "$current" = "$desired" ] && [ "$current" != "0" ]; then
                log_info "$full_service_name is healthy ($replicas replicas)"
                return 0
            fi
        fi

        log_warn "Health check attempt $i/$HEALTH_CHECK_RETRIES: $full_service_name has $replicas replicas"
        sleep $HEALTH_CHECK_INTERVAL
    done

    log_error "$full_service_name health check failed after $HEALTH_CHECK_RETRIES attempts"
    return 1
}

# Function to create backup of current deployment state
create_backup() {
    log_info "Creating backup of current deployment state..."
    mkdir -p "$BACKUP_DIR"

    BACKUP_FILE="${BACKUP_DIR}/backup_$(date +%Y%m%d_%H%M%S).txt"

    # Save current service state with full image info
    docker stack services "$STACK_NAME" --format "{{.Name}} {{.Image}}" > "$BACKUP_FILE" 2>/dev/null || true

    # Save the IMAGE_TAG that was used for this deployment
    echo "IMAGE_TAG=${IMAGE_TAG:-latest}" >> "$BACKUP_FILE"

    log_info "Backup created: $BACKUP_FILE"
}

# Function to run database migrations
# Returns 1 on failure to trigger rollback
run_migrations() {
    log_info "Running database migrations..."

    # Wait for API container to be fully ready
    sleep 5

    # Get API container ID (may have multiple replicas, get the first running one)
    API_CONTAINER=$(docker ps -q -f name="${STACK_NAME}_api" | head -1)

    if [ -z "$API_CONTAINER" ]; then
        log_error "API container not found - cannot run migrations"
        return 1
    fi

    log_info "Running migrations in container: $API_CONTAINER"

    # Run production migrations inside the container
    # Uses compiled JS files via migration:run:prod script
    if docker exec "$API_CONTAINER" npm run migration:run:prod; then
        log_info "Migrations completed successfully"
        return 0
    else
        log_error "Migration failed - this is a critical error"
        return 1
    fi
}

# Function to rollback deployment
rollback() {
    log_error "Deployment failed. Initiating rollback..."

    # Get the most recent backup
    local latest_backup=$(ls -t "${BACKUP_DIR}"/services_backup_*.txt 2>/dev/null | head -1)

    if [ -z "$latest_backup" ]; then
        log_error "No backup found. Manual intervention required."
        return 1
    fi

    log_info "Rolling back to previous version..."

    # For Swarm, we can use docker service rollback for individual services
    # or redeploy with the previous compose file
    cd "$PROJECT_DIR"

    # Try to rollback each service
    for service in api ui scheduler scraper; do
        local full_service_name="${STACK_NAME}_${service}"
        log_info "Rolling back $full_service_name..."
        docker service rollback "$full_service_name" 2>/dev/null || log_warn "Could not rollback $full_service_name"
    done

    log_info "Rollback completed. Please verify service health manually."
}

# Main deployment function
deploy() {
    log_info "Starting deployment process..."

    # Validate secrets exist before proceeding
    validate_secrets

    # Change to project directory
    cd "$PROJECT_DIR" || {
        log_error "Project directory not found: $PROJECT_DIR"
        exit 1
    }

    # Check if compose file exists (should be copied by CI)
    if [ ! -f "$COMPOSE_FILE" ]; then
        log_error "Compose file not found: $COMPOSE_FILE"
        log_error "The CI pipeline should have copied this file"
        exit 1
    fi

    # Create backup
    create_backup

    # Load environment variables for Docker image references
    if [ -f "${PROJECT_DIR}/.env" ]; then
        export $(grep -v '^#' "${PROJECT_DIR}/.env" | xargs)
    fi

    # Check if Swarm is initialized
    if ! docker info --format '{{.Swarm.LocalNodeState}}' | grep -q active; then
        log_error "Docker Swarm is not initialized"
        log_error "Initialize it with: docker swarm init"
        exit 1
    fi

    # Pull latest Docker images from GHCR
    log_info "Pulling latest Docker images from GHCR..."
    log_info "Using repository owner: ${GITHUB_REPOSITORY_OWNER:-unknown}"
    log_info "Using image tag: ${IMAGE_TAG:-latest}"

    # Pull images for all services
    for service in api ui scheduler scraper; do
        image="ghcr.io/${GITHUB_REPOSITORY_OWNER}/scoutlgs-${service}:${IMAGE_TAG:-latest}"
        log_info "Pulling ${image}..."
        if ! docker pull "$image"; then
            log_warn "Failed to pull ${image} - will retry during stack deploy"
        fi
    done

    # Deploy stack with Docker Swarm
    log_info "Deploying stack to Docker Swarm..."
    if ! docker stack deploy -c "$COMPOSE_FILE" "$STACK_NAME" --with-registry-auth; then
        log_error "Docker stack deploy failed"
        rollback
        exit 1
    fi

    log_info "Waiting for services to converge..."
    sleep 20

    # Health checks using Swarm service status
    log_info "Performing health checks..."

    # Check infrastructure services first
    if ! check_service_health "postgres"; then
        rollback
        exit 1
    fi

    if ! check_service_health "redis"; then
        rollback
        exit 1
    fi

    # Run database migrations after postgres is healthy
    # Migrations must complete successfully before API can serve traffic
    if ! run_migrations; then
        rollback
        exit 1
    fi

    # Check application services
    if ! check_service_health "api"; then
        rollback
        exit 1
    fi

    if ! check_service_health "ui"; then
        rollback
        exit 1
    fi

    if ! check_service_health "scheduler"; then
        rollback
        exit 1
    fi

    if ! check_service_health "scraper"; then
        rollback
        exit 1
    fi

    # Clean up old images
    log_info "Cleaning up old Docker images..."
    docker image prune -f

    # Display deployment info
    log_info "Deployment completed successfully!"
    log_info "Services status:"
    docker stack services "$STACK_NAME"

    # Create deployment log
    echo "Deployment completed at $(date)" >> "${PROJECT_DIR}/deployment.log"
    docker stack services "$STACK_NAME" >> "${PROJECT_DIR}/deployment.log"
}

# Trap errors and execute rollback
trap 'rollback' ERR

# Execute deployment
deploy
