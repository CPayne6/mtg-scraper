#!/usr/bin/env bash
set -eu

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
# Handle both Windows and Unix paths
if [[ "$OSTYPE" == "msys" ]] || [[ "$OSTYPE" == "win32" ]]; then
    # Running on Windows (Git Bash/MSYS)
    SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -W 2>/dev/null || pwd)"
    PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd -W 2>/dev/null || pwd)"
else
    # Running on Unix/Linux/macOS
    SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
    PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
fi

REMOTE_USER="${DEPLOY_USER:-deploy}"
REMOTE_HOST="${DEPLOY_HOST:-}"
REMOTE_PROJECT_DIR="${PROJECT_DIR:-/home/deploy/scoutlgs}"

# Logging functions
# Use printf instead of echo -e for better Windows compatibility
log_info() {
    printf "${GREEN}[INFO]${NC} %s\n" "$1"
}

log_warn() {
    printf "${YELLOW}[WARN]${NC} %s\n" "$1"
}

log_error() {
    printf "${RED}[ERROR]${NC} %s\n" "$1"
}

log_step() {
    printf "${BLUE}[STEP]${NC} %s\n" "$1"
}

# Function to check if required tools are installed
check_requirements() {
    log_step "Checking requirements..."

    local missing_tools=()

    if ! command -v ssh &> /dev/null; then
        missing_tools+=("ssh")
    fi

    if ! command -v scp &> /dev/null; then
        missing_tools+=("scp")
    fi

    if [ ${#missing_tools[@]} -gt 0 ]; then
        log_error "Missing required tools: ${missing_tools[*]}"
        log_error "Please install missing tools and try again"
        exit 1
    fi

    log_info "All requirements met"
}

# Function to validate environment variables
validate_config() {
    log_step "Validating configuration..."

    if [ -z "${REMOTE_HOST:-}" ]; then
        log_error "DEPLOY_HOST environment variable is required"
        log_error "Set it in your shell or pass it to this script"
        exit 1
    fi

    log_info "Using remote host: $REMOTE_HOST"
    log_info "Using remote user: $REMOTE_USER"
    log_info "Using remote project directory: $REMOTE_PROJECT_DIR"
}

# Function to read .env file and extract key-value pairs
parse_env_file() {
    local env_file=$1

    if [ ! -f "$env_file" ]; then
        log_warn "Environment file not found: $env_file"
        return 1
    fi

    # Read file, remove comments and empty lines, output key=value pairs
    # More portable approach that works on Windows
    while IFS= read -r line || [ -n "$line" ]; do
        # Skip comments and empty lines
        if [[ "$line" =~ ^[[:space:]]*# ]] || [[ -z "$line" ]]; then
            continue
        fi
        echo "$line"
    done < "$env_file"
}

# Function to create Docker secret on remote server
create_docker_secret() {
    local secret_name=$1
    local secret_value=$2

    # Create secret on remote server
    # Using printf to handle multiline values and special characters
    if ssh "${REMOTE_USER}@${REMOTE_HOST}" "printf '%s' '$secret_value' | docker secret create '$secret_name' - 2>/dev/null"; then
        log_info "✓ Created secret: $secret_name"
        return 0
    else
        # Secret might already exist
        log_warn "Secret '$secret_name' may already exist or creation failed"
        return 1
    fi
}

# Function to update existing Docker secret (remove and recreate)
update_docker_secret() {
    local secret_name=$1
    local secret_value=$2

    log_info "Updating secret: $secret_name"

    # Remove old secret (ignore errors if it doesn't exist)
    ssh "${REMOTE_USER}@${REMOTE_HOST}" "docker secret rm '$secret_name' 2>/dev/null || true"

    # Create new secret
    if ssh "${REMOTE_USER}@${REMOTE_HOST}" "printf '%s' '$secret_value' | docker secret create '$secret_name' -"; then
        log_info "✓ Updated secret: $secret_name"
        return 0
    else
        log_error "Failed to update secret: $secret_name"
        return 1
    fi
}

# Function to process a single .env file and create secrets
process_env_file() {
    local env_file=$1
    local service_name=$2

    log_step "Processing $service_name environment file: $env_file"

    if [ ! -f "$env_file" ]; then
        log_warn "Skipping - file not found: $env_file"
        return 0
    fi

    local secrets_created=0
    local secrets_failed=0

    while IFS='=' read -r key value; do
        # Skip empty lines and comments
        if [ -z "$key" ] || [[ "$key" =~ ^[[:space:]]*# ]]; then
            continue
        fi

        # Remove leading/trailing whitespace
        key=$(echo "$key" | xargs)
        value=$(echo "$value" | xargs)

        # Skip if value is empty
        if [ -z "$value" ]; then
            log_warn "Skipping $key - empty value"
            continue
        fi

        # Create secret name: service_KEY (e.g., api_DATABASE_PASSWORD)
        local secret_name="${service_name}_${key}"

        # Convert to lowercase for Docker secret naming convention
        secret_name=$(echo "$secret_name" | tr '[:upper:]' '[:lower:]')

        # Create the secret
        if create_docker_secret "$secret_name" "$value"; then
            ((secrets_created++))
        else
            ((secrets_failed++))
        fi

    done < <(parse_env_file "$env_file")

    log_info "Service $service_name: $secrets_created created, $secrets_failed failed/existed"
}

# Function to create global secrets (from root .env)
process_global_secrets() {
    log_step "Processing global secrets from root .env"

    local root_env="$PROJECT_ROOT/.env"

    if [ ! -f "$root_env" ]; then
        log_warn "Root .env file not found, skipping global secrets"
        return 0
    fi

    local secrets_created=0
    local secrets_failed=0

    while IFS='=' read -r key value; do
        # Skip empty lines and comments
        if [ -z "$key" ] || [[ "$key" =~ ^[[:space:]]*# ]]; then
            continue
        fi

        # Remove leading/trailing whitespace
        key=$(echo "$key" | xargs)
        value=$(echo "$value" | xargs)

        # Skip if value is empty
        if [ -z "$value" ]; then
            continue
        fi

        # Create secret name in lowercase
        local secret_name=$(echo "$key" | tr '[:upper:]' '[:lower:]')

        if create_docker_secret "$secret_name" "$value"; then
            ((secrets_created++))
        else
            ((secrets_failed++))
        fi

    done < <(parse_env_file "$root_env")

    log_info "Global secrets: $secrets_created created, $secrets_failed failed/existed"
}

# Main function
main() {
    echo ""
    log_info "========================================="
    log_info "Docker Secrets Setup Script"
    log_info "========================================="
    echo ""

    # Check requirements
    check_requirements

    # Validate configuration
    validate_config

    # Test SSH connection
    log_step "Testing SSH connection..."
    if ! ssh "${REMOTE_USER}@${REMOTE_HOST}" "echo 'SSH connection successful'" > /dev/null 2>&1; then
        log_error "Cannot connect to remote server"
        log_error "Make sure SSH is configured correctly"
        exit 1
    fi
    log_info "SSH connection verified"

    # Check if Docker Swarm is initialized
    log_step "Checking Docker Swarm status..."
    if ! ssh "${REMOTE_USER}@${REMOTE_HOST}" "docker info --format '{{.Swarm.LocalNodeState}}' | grep -q active"; then
        log_warn "Docker Swarm is not initialized"
        log_info "Initializing Docker Swarm mode..."

        if ssh "${REMOTE_USER}@${REMOTE_HOST}" "docker swarm init"; then
            log_info "✓ Docker Swarm initialized"
        else
            log_error "Failed to initialize Docker Swarm"
            log_error "Docker Secrets require Docker Swarm mode"
            exit 1
        fi
    else
        log_info "Docker Swarm is active"
    fi

    echo ""
    log_step "Creating secrets from local .env files..."
    echo ""

    # Process global secrets
    process_global_secrets

    echo ""

    # Process API secrets
    process_env_file "$PROJECT_ROOT/apps/api/.env" "api"

    echo ""

    # Process UI secrets
    process_env_file "$PROJECT_ROOT/apps/ui/.env" "ui"

    echo ""

    # Process Scraper secrets
    process_env_file "$PROJECT_ROOT/apps/scraper/.env" "scraper"

    echo ""

    # Process Scheduler secrets
    process_env_file "$PROJECT_ROOT/apps/scheduler/.env" "scheduler"

    echo ""
    log_info "========================================="
    log_info "Secrets setup completed!"
    log_info "========================================="
    echo ""

    # List all secrets
    log_info "Current secrets on server:"
    ssh "${REMOTE_USER}@${REMOTE_HOST}" "docker secret ls"

    echo ""
    log_warn "Important Notes:"
    log_warn "1. Secrets are now stored securely in Docker Swarm"
    log_warn "2. You need to update docker-compose.yml to use these secrets"
    log_warn "3. Applications need to read from /run/secrets/<secret_name>"
    log_warn "4. To update a secret, you must remove and recreate it"
    log_warn "5. Restart services after updating secrets"
    echo ""
}

# Handle script arguments
case "${1:-}" in
    --help|-h)
        echo "Usage: $0"
        echo ""
        echo "Environment variables:"
        echo "  DEPLOY_HOST       Remote server hostname (required)"
        echo "  DEPLOY_USER       Remote server username (default: deploy)"
        echo "  PROJECT_DIR       Remote project directory (default: /home/deploy/scoutlgs)"
        echo ""
        echo "Example:"
        echo "  DEPLOY_HOST=ssh.example.com ./scripts/setup-secrets.sh"
        exit 0
        ;;
    *)
        main "$@"
        ;;
esac
