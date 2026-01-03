#!/bin/bash
# Development environment startup script

echo "Starting MTG Scraper Development Environment..."
echo ""

# Check if .env files exist
check_env_file() {
    if [ ! -f "$1" ]; then
        echo "Warning: $1 not found"
        if [ -f "$1.example" ]; then
            echo "   Creating from $1.example..."
            cp "$1.example" "$1"
            echo "   Created $1 - please review and update values"
        else
            echo "   No example file found. Please create $1"
        fi
    else
        echo "[OK] $1 exists"
    fi
}

echo "Checking environment files..."
check_env_file "apps/api/.env"
check_env_file "apps/ui/.env"
check_env_file "apps/scraper/.env"
check_env_file "apps/scheduler/.env"
echo ""

# Start docker-compose
echo "Starting Docker containers with hot reload..."
echo "This may take a few minutes on first run..."
echo ""

docker-compose -f docker-compose.dev.yml up --build

echo ""
echo "Development environment stopped"
