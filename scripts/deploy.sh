#!/usr/bin/env bash
set -eu

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
PROJECT_DIR="${PROJECT_DIR:-/home/deploy/scoutlgs}"
COMPOSE_FILE="${PROJECT_DIR}/docker-compose.yml"
BACKUP_DIR="${PROJECT_DIR}/backups"
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

# Function to check if a service is healthy
check_service_health() {
    local service=$1
    local url=$2

    log_info "Checking health of $service at $url"

    for i in $(seq 1 $HEALTH_CHECK_RETRIES); do
        if curl -f -s -o /dev/null -w "%{http_code}" "$url" | grep -q "200"; then
            log_info "$service is healthy"
            return 0
        fi
        log_warn "Health check attempt $i/$HEALTH_CHECK_RETRIES failed for $service"
        sleep $HEALTH_CHECK_INTERVAL
    done

    log_error "$service health check failed after $HEALTH_CHECK_RETRIES attempts"
    return 1
}

# Function to create backup of current images
create_backup() {
    log_info "Creating backup of current deployment state..."
    mkdir -p "$BACKUP_DIR"

    # Save current image tags
    docker compose -f "$COMPOSE_FILE" images --format json > "${BACKUP_DIR}/images_backup_$(date +%Y%m%d_%H%M%S).json"

    log_info "Backup created successfully"
}

# Function to rollback deployment
rollback() {
    log_error "Deployment failed. Initiating rollback..."

    # Get the most recent backup
    local latest_backup=$(ls -t "${BACKUP_DIR}"/images_backup_*.json 2>/dev/null | head -1)

    if [ -z "$latest_backup" ]; then
        log_error "No backup found. Manual intervention required."
        return 1
    fi

    log_info "Rolling back to previous version..."

    # Revert to previous docker-compose state
    cd "$PROJECT_DIR"
    git reset --hard HEAD@{1} || log_warn "Git reset failed, continuing anyway"

    # Restart with previous configuration
    docker compose -f "$COMPOSE_FILE" up -d

    log_info "Rollback completed. Please verify service health manually."
}

# Main deployment function
deploy() {
    log_info "Starting deployment process..."

    # Change to project directory
    cd "$PROJECT_DIR" || {
        log_error "Project directory not found: $PROJECT_DIR"
        exit 1
    }

    # Create backup
    create_backup

    # Pull latest docker-compose file from repository
    log_info "Pulling latest docker-compose.prod.yml from repository..."
    git fetch origin
    git checkout origin/refactor/nextjs-to-react-nest -- docker-compose.prod.yml

    # Load environment variables for Docker image references
    if [ -f "${PROJECT_DIR}/.env" ]; then
        export $(grep -v '^#' "${PROJECT_DIR}/.env" | xargs)
    fi

    # Production always uses Docker Swarm mode with secrets
    log_info "Using Docker Swarm mode with Docker Secrets"
    COMPOSE_FILE="${PROJECT_DIR}/docker-compose.prod.yml"
    STACK_NAME="scoutlgs"

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
    # Note: docker stack deploy pulls images automatically, but we do it explicitly for visibility
    for service in api ui scheduler scraper; do
        image="ghcr.io/${GITHUB_REPOSITORY_OWNER}/scoutlgs-${service}:${IMAGE_TAG:-latest}"
        log_info "Pulling ${image}..."
        if ! docker pull "$image"; then
            log_warn "Failed to pull ${image} - will retry during stack deploy"
        fi
    done

    # Run database migrations
    # TODO: Uncomment when ready to enable automated migrations
    # log_info "Running database migrations..."
    # if ! docker service create --name migration-runner --rm --network scoutlgs_scoutlgs-network \
    #     --mount type=bind,source=${PROJECT_DIR},target=/app \
    #     ghcr.io/${GITHUB_REPOSITORY_OWNER}/scoutlgs-api:${IMAGE_TAG:-latest} \
    #     npm run migration:run; then
    #     log_error "Database migrations failed"
    #     exit 1
    # fi

    # Deploy stack with Docker Swarm
    log_info "Deploying stack to Docker Swarm..."
    if ! docker stack deploy -c "$COMPOSE_FILE" "$STACK_NAME"; then
        log_error "Docker stack deploy failed"
        rollback
        exit 1
    fi

    log_info "Waiting for services to be ready..."
    sleep 20

    # Health checks
    log_info "Performing health checks..."

    if ! check_service_health "API" "http://localhost:5000/api/health"; then
        rollback
        exit 1
    fi

    if ! check_service_health "UI" "http://localhost:3000"; then
        rollback
        exit 1
    fi

    # Clean up old images
    log_info "Cleaning up old Docker images..."
    docker image prune -f

    # Display deployment info
    log_info "Deployment completed successfully!"
    log_info "Services status:"
    docker compose -f "$COMPOSE_FILE" ps

    # Create deployment log
    echo "Deployment completed at $(date)" >> "${PROJECT_DIR}/deployment.log"
    docker compose -f "$COMPOSE_FILE" images >> "${PROJECT_DIR}/deployment.log"
}

# Trap errors and execute rollback
trap 'rollback' ERR

# Execute deployment
deploy
