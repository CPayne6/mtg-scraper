#!/usr/bin/env bash
set -eu

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Project Root Directory (where this script is located)
# Handle both Git Bash and PowerShell-invoked bash
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -W 2>/dev/null || pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd -W 2>/dev/null || pwd)"

# Convert Windows paths to Unix paths for Git Bash compatibility
# Handles both C:\path and C:/path formats
if [[ "$SCRIPT_DIR" =~ ^[A-Za-z]: ]]; then
    # Convert C:\path or C:/path to /c/path
    SCRIPT_DIR="$(echo "$SCRIPT_DIR" | sed 's|^\([A-Za-z]\):|/\L\1|' | sed 's|\\|/|g')"
fi

if [[ "$PROJECT_ROOT" =~ ^[A-Za-z]: ]]; then
    # Convert C:\path or C:/path to /c/path
    PROJECT_ROOT="$(echo "$PROJECT_ROOT" | sed 's|^\([A-Za-z]\):|/\L\1|' | sed 's|\\|/|g')"
fi

# SSH Configuration
# Use SSH config host by default, fallback to direct connection
SSH_CONFIG_HOST="${SSH_CONFIG_HOST:-scoutlgs_lan}"
REMOTE_HOST="${DEPLOY_HOST:-${SSH_CONFIG_HOST}}"
REMOTE_USER="${DEPLOY_USER:-}"  # Will be read from SSH config if not set
REMOTE_PROJECT_DIR="${PROJECT_DIR:-/home/deploy/mtg-scraper}"

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

    # Prompt for SSH host if not set
    if [ -z "${REMOTE_HOST:-}" ]; then
        log_warn "No deployment target specified"
        echo ""
        printf "Enter SSH config host or hostname [scoutlgs_lan]: "
        read -r input_host
        REMOTE_HOST="${input_host:-scoutlgs_lan}"
        echo ""
    fi

    log_info "Using SSH target: $REMOTE_HOST"

    # Display additional info if using SSH config host
    if [ "$REMOTE_HOST" = "scoutlgs_lan" ] || [ "$REMOTE_HOST" = "scoutlgs_prod" ]; then
        log_info "Using SSH config host (see ~/.ssh/config)"
    fi

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
    if ssh "${REMOTE_HOST}" "printf '%s' '$secret_value' | docker secret create '$secret_name' - 2>/dev/null"; then
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
    ssh "${REMOTE_HOST}" "docker secret rm '$secret_name' 2>/dev/null || true"

    # Create new secret
    if ssh "${REMOTE_HOST}" "printf '%s' '$secret_value' | docker secret create '$secret_name' -"; then
        log_info "✓ Updated secret: $secret_name"
        return 0
    else
        log_error "Failed to update secret: $secret_name"
        return 1
    fi
}

# Function to upsert Docker secret (create or update if exists)
upsert_docker_secret() {
    local secret_name=$1
    local secret_value=$2

    # Try to create the secret first
    # Use -n flag to prevent SSH from consuming stdin (important when called in while loop)
    if ssh -n "${REMOTE_HOST}" "printf '%s' '$secret_value' | docker secret create '$secret_name' - 2>/dev/null"; then
        log_info "✓ Created secret: $secret_name"
        return 0
    else
        # Secret already exists, update it
        log_info "Secret '$secret_name' exists, updating..."

        # Remove old secret
        ssh -n "${REMOTE_HOST}" "docker secret rm '$secret_name' 2>/dev/null || true"

        # Create new secret
        if ssh -n "${REMOTE_HOST}" "printf '%s' '$secret_value' | docker secret create '$secret_name' -"; then
            log_info "✓ Updated secret: $secret_name"
            return 0
        else
            log_error "Failed to update secret: $secret_name"
            return 1
        fi
    fi
}

# Function to process secrets based on JSON mapping file
process_secret_mappings() {
    local mappings_file="$PROJECT_ROOT/scripts/secret-mappings.json"

    if [ ! -f "$mappings_file" ]; then
        log_error "Secret mappings file not found: $mappings_file"
        log_error "Please create $mappings_file with secret mappings"
        exit 1
    fi

    # Check if Node.js is available
    if ! command -v node &> /dev/null; then
        log_error "Node.js is required but not installed"
        log_error "Please install Node.js: https://nodejs.org/"
        exit 1
    fi

    # Check if reader script exists
    local reader_script="$PROJECT_ROOT/scripts/read-secret-mappings.js"
    if [ ! -f "$reader_script" ]; then
        log_error "Secret mappings reader script not found: $reader_script"
        exit 1
    fi

    local secrets_created=0
    local secrets_failed=0
    local secrets_skipped=0
    local missing_required_secrets=()

    log_step "Processing secrets from mapping file..."

    # Use Node.js to read JSON and output pipe-delimited format
    while IFS='|' read -r secret_name env_file env_var optional; do
        # Skip empty lines
        if [ -z "$secret_name" ]; then
            continue
        fi

        # Resolve full path to env file
        local full_env_path="$PROJECT_ROOT/$env_file"

        # Check if env file exists
        if [ ! -f "$full_env_path" ]; then
            if [ "$optional" = "true" ]; then
                log_info "Skipping optional secret (file not found): $secret_name"
                secrets_skipped=$((secrets_skipped + 1))
                continue
            else
                log_error "Env file not found: $full_env_path (for secret: $secret_name)"
                missing_required_secrets+=("$secret_name")
                continue
            fi
        fi

        # Extract value from env file (handles quotes properly)
        local value=$(grep "^${env_var}=" "$full_env_path" | head -1 | cut -d'=' -f2- | sed 's/^["'\''[:space:]]*//;s/["'\''[:space:]]*$//')

        if [ -z "$value" ]; then
            if [ "$optional" = "true" ]; then
                log_info "Skipping optional secret (variable not found): $secret_name"
                secrets_skipped=$((secrets_skipped + 1))
                continue
            else
                log_error "Variable $env_var not found or empty in $env_file (for secret: $secret_name)"
                missing_required_secrets+=("$secret_name")
                continue
            fi
        fi

        # Create/update the secret
        if upsert_docker_secret "$secret_name" "$value"; then
            secrets_created=$((secrets_created + 1))
        else
            secrets_failed=$((secrets_failed + 1))
        fi
    done < <(node "$reader_script" "$mappings_file")

    echo ""
    log_info "========================================="
    log_info "Summary: $secrets_created created/updated, $secrets_skipped skipped (optional), $secrets_failed failed"
    log_info "========================================="

    if [ ${#missing_required_secrets[@]} -gt 0 ]; then
        echo ""
        log_error "Missing required secrets:"
        for secret in "${missing_required_secrets[@]}"; do
            log_error "  - $secret"
        done
        echo ""
        log_error "Deployment will fail without these secrets!"
        exit 1
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
        if upsert_docker_secret "$secret_name" "$value"; then
            secrets_created=$((secrets_created + 1))
        else
            secrets_failed=$((secrets_failed + 1))
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

        if upsert_docker_secret "$secret_name" "$value"; then
            secrets_created=$((secrets_created + 1))
        else
            secrets_failed=$((secrets_failed + 1))
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
    log_step "Testing SSH connection to ${REMOTE_HOST}..."
    if ! ssh -o BatchMode=yes -o ConnectTimeout=10 "${REMOTE_HOST}" "echo 'SSH connection successful'" > /dev/null 2>&1; then
        log_error "Cannot connect to remote server"
        log_error "Make sure SSH is configured correctly"
        log_error "Test manually with: ssh ${REMOTE_HOST}"
        exit 1
    fi
    log_info "SSH connection verified"

    # Check if Docker Swarm is initialized
    log_step "Checking Docker Swarm status..."
    if ! ssh "${REMOTE_HOST}" "docker info --format '{{.Swarm.LocalNodeState}}' | grep -q active"; then
        log_warn "Docker Swarm is not initialized"
        log_info "Initializing Docker Swarm mode..."

        if ssh "${REMOTE_HOST}" "docker swarm init"; then
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

    # Process secrets based on mappings file
    process_secret_mappings

    echo ""

    # List all secrets
    log_info "Current secrets on server:"
    ssh "${REMOTE_HOST}" "docker secret ls"

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
    --debug)
        echo "Debug Information:"
        echo "  SCRIPT_DIR: $SCRIPT_DIR"
        echo "  PROJECT_ROOT: $PROJECT_ROOT"
        echo "  REMOTE_HOST: $REMOTE_HOST"
        echo "  REMOTE_PROJECT_DIR: $REMOTE_PROJECT_DIR"
        echo "  SSH_CONFIG_HOST: $SSH_CONFIG_HOST"
        echo ""
        echo "Checking .env files:"
        echo "  Root .env: $([ -f "$PROJECT_ROOT/.env" ] && echo "EXISTS" || echo "NOT FOUND")"
        echo "  API .env: $([ -f "$PROJECT_ROOT/apps/api/.env" ] && echo "EXISTS" || echo "NOT FOUND")"
        echo "  UI .env: $([ -f "$PROJECT_ROOT/apps/ui/.env" ] && echo "EXISTS" || echo "NOT FOUND")"
        echo "  Scraper .env: $([ -f "$PROJECT_ROOT/apps/scraper/.env" ] && echo "EXISTS" || echo "NOT FOUND")"
        echo "  Scheduler .env: $([ -f "$PROJECT_ROOT/apps/scheduler/.env" ] && echo "EXISTS" || echo "NOT FOUND")"
        exit 0
        ;;
    --help|-h)
        echo "Usage: $0 [--debug|--help]"
        echo ""
        echo "Environment variables:"
        echo "  DEPLOY_HOST       Remote server hostname (will prompt if not set)"
        echo "  DEPLOY_USER       Remote server username (default: deploy)"
        echo "  PROJECT_DIR       Remote project directory (default: /home/deploy/mtg-scraper)"
        echo ""
        echo "SSH Configuration:"
        echo "  This script uses the SSH key: ~/.ssh/scoutlgs_deploy_key"
        echo "  Generate it with:"
        echo "    ssh-keygen -t ed25519 -C \"scoutlgs-deployment\" -f ~/.ssh/scoutlgs_deploy_key"
        echo "  Copy to server:"
        echo "    ssh-copy-id -i ~/.ssh/scoutlgs_deploy_key.pub deploy@your-server.com"
        echo ""
        echo "Example:"
        echo "  DEPLOY_HOST=ssh.example.com ./scripts/setup-secrets.sh"
        echo "  # Or just run it and follow the prompts:"
        echo "  ./scripts/setup-secrets.sh"
        exit 0
        ;;
    *)
        main "$@"
        ;;
esac
