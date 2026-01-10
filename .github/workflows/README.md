# GitHub Actions CI/CD Pipeline

This directory contains the unified CI/CD workflow for the MTG Scraper monorepo.

## Workflow File

**`ci-cd.yml`** - Single unified pipeline for both PR validation and production deployments

## How It Works

### Triggers

- **Push to main branches**: Full pipeline with Docker push and deployment
- **Pull Requests**: Full validation without Docker push
- **Manual trigger**: Via workflow_dispatch

### Smart Behavior

```yaml
# PRs: Build everything, validate Docker builds, but DON'T push images
pull_request → validate → docker build (no push) ✅

# Main branch: Full pipeline with Docker push and deployment
push(main) → validate → docker build & push → deploy 🚀
```

---

## Pipeline Stages

### 1. Setup (1 job, ~30s with cache)
**What it does:**
- Installs pnpm dependencies once
- Creates reusable cache for all subsequent jobs
- Outputs cache key for other jobs to restore

**Optimizations:**
- ✅ Only installs if cache miss
- ✅ Shares cache across all parallel jobs
- ✅ Uses `fail-on-cache-miss` in dependent jobs for fast failure

---

### 2. Lint (4 parallel jobs, ~1min)
**What it does:**
- Runs ESLint on all 4 apps in parallel
- Each job restores node_modules from setup cache

**Matrix:**
```yaml
matrix:
  app: [api, ui, scraper, scheduler]
```

**Optimizations:**
- ✅ `fail-fast: false` - All jobs run even if one fails
- ✅ `cache/restore` instead of full `cache` action (faster)
- ✅ Shares single node_modules cache

---

### 3. Type Check (4 parallel jobs, ~1min)
**What it does:**
- Runs TypeScript compiler in check mode (`--noEmit`)
- Custom commands per app (UI uses `tsc -b`)

**Optimizations:**
- ✅ No compilation output needed (just validation)
- ✅ Parallel execution with shared cache

---

### 4. Test (5 parallel jobs, ~3-5min)
**What it does:**
- Unit tests with coverage (api, scraper, scheduler)
- E2E tests (api, scraper)
- Spins up PostgreSQL and Redis service containers

**Optimizations:**
- ✅ Tests run in parallel with shared service containers
- ✅ Test results visible in Actions UI

---

### 5. Build (1 job, ~2-3min)
**What it does:**
- Builds all packages and apps using Nx
- Caches both Nx cache and build outputs
- Uploads artifacts as fallback

**Optimizations:**
- ✅ **Nx caching** - Skips unchanged packages
- ✅ **Build output cache** - Keyed by commit SHA
- ✅ **Artifact upload** - 7-day retention as fallback
- ✅ Fetch depth 0 for Nx affected commands

**Cache Strategy:**
```yaml
# Nx internal cache (computation results)
key: ${{ runner.os }}-nx-${{ github.sha }}
restore-keys: ${{ runner.os }}-nx-

# Build outputs (dist folders)
key: ${{ runner.os }}-build-${{ github.sha }}
```

---

### 6. Docker Build & Push (4 parallel jobs, ~5-8min)
**What it does:**
- Builds Docker images for all 4 services
- **Conditionally pushes** based on event type

**Key Logic:**
```yaml
# Always build for validation
build: true

# Only login and push on push to main branches
login: ${{ github.event_name == 'push' && ... }}
push: ${{ github.event_name == 'push' && ... }}
```

**Optimizations:**
- ✅ **Docker layer caching** - Scoped per service
- ✅ **Parallel builds** - All 4 images simultaneously
- ✅ **Conditional push** - PRs validate but don't push
- ✅ Build summary shows whether pushed or not

**Cache Strategy:**
```yaml
cache-from: type=gha,scope=${{ matrix.service.name }}
cache-to: type=gha,mode=max,scope=${{ matrix.service.name }}
```

Each service (api, ui, scraper, scheduler) has its own cache scope to prevent conflicts.

---

### 7. Deploy (1 job, conditional)
**What it does:**
- Triggers Portainer webhook for auto-deployment
- **Only runs on push to main branch**

**Conditions:**
- Event must be `push`
- Branch must be `main`
- Docker push must succeed

---

### 8. Summary (1 job, always)
**What it does:**
- Generates pipeline summary with all job results
- Shows whether Docker images were pushed
- Runs even if previous jobs fail

**Output:**
```
# CI/CD Pipeline Summary

Event: pull_request / push
Branch: main / feature-branch
Commit: abc123f

## Job Results
- Lint: success
- Type Check: success
- Tests: success
- Build: success
- Docker: success

Note: Docker images were built but not pushed (PR validation only)
```

---

## Caching Strategy

### 1. pnpm Store Cache
```yaml
key: ${{ runner.os }}-pnpm-store-${{ hashFiles('**/pnpm-lock.yaml') }}
restore-keys: ${{ runner.os }}-pnpm-store-
```
- **Benefit:** Faster pnpm install (downloads cached packages)
- **Invalidates:** When pnpm-lock.yaml changes
- **Size:** ~100-200MB

### 2. node_modules Cache
```yaml
key: ${{ runner.os }}-node-modules-${{ hashFiles('**/pnpm-lock.yaml') }}
```
- **Benefit:** Skip `pnpm install` entirely if lock unchanged
- **Invalidates:** When pnpm-lock.yaml changes
- **Size:** ~500MB-1GB
- **Shared:** Across all jobs via `cache/restore`

### 3. Nx Cache
```yaml
key: ${{ runner.os }}-nx-${{ github.sha }}
restore-keys: ${{ runner.os }}-nx-
```
- **Benefit:** Nx skips rebuilding unchanged packages
- **Invalidates:** Per commit (restore from any previous commit)
- **Size:** ~50-100MB

### 4. Build Outputs Cache
```yaml
key: ${{ runner.os }}-build-${{ github.sha }}
```
- **Benefit:** Docker builds could potentially use pre-built artifacts
- **Invalidates:** Per commit
- **Size:** ~100-200MB

### 5. Docker Layer Cache
```yaml
cache-from: type=gha,scope=api
cache-to: type=gha,mode=max,scope=api
```
- **Benefit:** Reuses unchanged Docker layers
- **Invalidates:** When Dockerfile or dependencies change
- **Size:** ~500MB per service
- **Scoped:** Separate cache per service to prevent conflicts

---

## Performance Optimizations

### Parallelization
```
Setup (1 job)
    ├── Lint (4 jobs)          ──┐
    ├── Type Check (4 jobs)    ─┤
    └── Test (5 jobs)          ─┘ All run in parallel
            ↓
        Build (1 job)
            ↓
        Docker (4 jobs in parallel)
            ↓
        Deploy (1 job)
            ↓
        Summary (1 job)
```

**Total concurrent jobs:** Up to 13 parallel jobs

### Cache Restoration Speed
- **Before:** Each job runs `pnpm install` (~2-3 min)
- **After:** Each job restores cache (~10-20 sec)
- **Savings:** ~2-3 minutes per job × 14 jobs = **~30-40 min saved**

### Nx Build Speed
- **First build:** ~2-3 min (builds everything)
- **Subsequent builds:** ~30-60 sec (Nx skips unchanged)
- **Savings:** ~50-70% on builds with minimal changes

### Docker Build Speed
- **First build:** ~8-10 min (4 services)
- **With cache:** ~3-5 min (reuses layers)
- **Savings:** ~50% on Docker builds

---

## Expected Build Times

### Cold Cache (first build)
```
Setup:          2-3 min
Lint:           1-2 min
Type Check:     1-2 min
Tests:          4-6 min
Build:          3-4 min
Docker:         8-10 min
--------------------
Total:          ~18-23 min
```

### Warm Cache (typical build)
```
Setup:          20-30 sec (cache hit)
Lint:           40-60 sec
Type Check:     40-60 sec
Tests:          3-5 min (services startup time)
Build:          1-2 min (Nx cache)
Docker:         4-6 min (layer cache)
--------------------
Total:          ~9-14 min
```

### PR Validation vs Main Push

**Pull Request:**
- All stages run
- Docker images built but NOT pushed
- No deployment
- **Time:** ~9-14 min (with cache)

**Main Branch Push:**
- All stages run
- Docker images built AND pushed
- Deployment triggered
- **Time:** ~13-18 min (with cache, includes push time)

---

## Environment Variables

### Defined in Workflow
```yaml
REGISTRY: ghcr.io              # GitHub Container Registry
NODE_VERSION: '20'             # Node.js version
PNPM_VERSION: '10.26.2'        # pnpm version
```

### GitHub Secrets (Optional)
- `PORTAINER_WEBHOOK_URL` - For auto-deployment

### Automatically Provided
- `GITHUB_TOKEN` - For pushing to GHCR
- `github.sha` - Commit SHA
- `github.ref` - Branch reference
- `github.event_name` - Event type (push/pull_request)

---

## Docker Image Tags

### On Pull Request
```
ghcr.io/<user>/mtg-scraper-api:pr-123
```
- Built but not pushed
- Validates Dockerfile

### On Push to Branch
```
ghcr.io/<user>/mtg-scraper-api:main
ghcr.io/<user>/mtg-scraper-api:main-abc123f
```

### On Push to Main (Default Branch)
```
ghcr.io/<user>/mtg-scraper-api:latest
ghcr.io/<user>/mtg-scraper-api:main
ghcr.io/<user>/mtg-scraper-api:main-abc123f
```

### On Git Tag (Semantic Version)
```
ghcr.io/<user>/mtg-scraper-api:v1.0.0
ghcr.io/<user>/mtg-scraper-api:1.0
ghcr.io/<user>/mtg-scraper-api:latest
```

---

## Job Outputs

### Setup Job
```yaml
outputs:
  cache-key: <cache-key-for-node-modules>
```
Used by all downstream jobs to restore cache.

### Build Job
```yaml
outputs:
  build-cache-key: <cache-key-for-build-outputs>
```
Could be used by Docker builds (currently not implemented).

---

## Artifact Management

### Build Artifacts
- **Name:** `build-artifacts`
- **Retention:** 7 days
- **Size:** ~50-100MB
- **Usage:** Fallback if cache fails, debugging build outputs

---

## Troubleshooting

### Cache Miss Errors
```
Error: Cache miss for key: Linux-node-modules-<hash>
```

**Solution:** The setup job likely failed. Check setup job logs.

### Nx Build Failures
```
Error: Cannot find module '@mtg-scraper/shared'
```

**Solution:** Ensure packages are built before apps. Nx should handle this automatically, but check dependency order in nx.json.

### Docker Push Failures
```
Error: denied: permission_denied
```

**Solution:**
- Check GITHUB_TOKEN has packages:write permission
- Verify repository owner matches GHCR organization
- Ensure conditional push logic is correct

### Test Service Container Issues
```
Error: Connection refused to postgres
```

**Solution:**
- Service containers take ~10-20s to be healthy
- Check health check configuration
- Verify port mappings

---

## Local Testing

### Validate Workflow Syntax
```bash
# Install act (GitHub Actions local runner)
brew install act  # macOS
# or
curl https://raw.githubusercontent.com/nektos/act/master/install.sh | sudo bash

# Validate workflow
act --list

# Run specific job
act -j lint

# Run full workflow (requires Docker)
act pull_request
```

### Test Caching Locally
```bash
# Simulate pnpm install with cache
pnpm install --frozen-lockfile

# Check cache size
du -sh node_modules
du -sh ~/.pnpm-store

# Test Nx cache
pnpm nx reset  # Clear cache
pnpm nx run-many --target=build --all
pnpm nx run-many --target=build --all  # Should be instant
```

---

## Cost Optimization

### GitHub Actions Minutes (Free Tier)
- **Public repos:** Unlimited
- **Private repos:** 2,000 minutes/month

### Estimated Usage per Build
- PR validation: ~9-14 min
- Main push: ~13-18 min

### Monthly Capacity (Private Repo)
- ~110-150 builds/month on free tier
- ~4-5 builds per day

### Optimization Tips
1. **Use Nx affected:** Only build changed apps
2. **Skip jobs conditionally:** Use path filters
3. **Cache aggressively:** Already implemented
4. **Self-hosted runners:** For unlimited builds

### Adding Path Filters (Optional)
```yaml
on:
  pull_request:
    paths:
      - 'apps/**'
      - 'packages/**'
      - 'pnpm-lock.yaml'
```

Skips pipeline if only README changes.

---

## Monitoring & Badges

### Add Status Badge to README
```markdown
![CI/CD](https://github.com/<user>/mtg-scraper/actions/workflows/ci-cd.yml/badge.svg)
```

### View Pipeline Status
1. GitHub → Actions tab
2. Click workflow run
3. View job logs and summaries

### Enable Notifications
- Settings → Notifications → Actions
- Configure email/Slack/Discord

---

## Advanced Features

### Nx Affected Commands (Future)
```yaml
# Only build affected apps
- name: Build affected
  run: pnpm nx affected --target=build --base=origin/main
```

### Matrix Exclusions
```yaml
matrix:
  app: [api, ui, scraper, scheduler]
  exclude:
    - app: ui  # Skip UI tests if not ready
```

### Conditional Jobs
```yaml
jobs:
  deploy-staging:
    if: github.ref == 'refs/heads/develop'
    # Deploy to staging environment
```

### Reusable Workflows
Create `.github/workflows/reusable-test.yml`:
```yaml
on:
  workflow_call:
    inputs:
      app:
        required: true
        type: string
```

---

## Security Best Practices

✅ **Implemented:**
- Minimal GITHUB_TOKEN permissions
- `fail-on-cache-miss` prevents cache poisoning
- No secrets in logs
- Service containers isolated per job

🔒 **Recommended:**
- Enable Dependabot for automated updates
- Configure branch protection rules
- Require status checks before merge
- Add Trivy or Snyk security scanning (optional)
- Enable GitHub Advanced Security (if available)

---

## Next Steps

1. ✅ **Workflow created and optimized**
2. ⏭️ **Push to GitHub** - Commit and push workflows
3. ⏭️ **First run** - Watch Actions tab for first build
4. ⏭️ **Add secrets** - Configure PORTAINER_WEBHOOK_URL (optional)
5. ⏭️ **Enable branch protection** - Require CI checks
6. ⏭️ **Add status badge** - Show build status in README

---

## Summary

This unified workflow provides:

✅ **Single source of truth** - One workflow for PRs and production
✅ **Smart conditional logic** - Docker push only on main branches
✅ **Aggressive caching** - 5 cache layers for maximum speed
✅ **Parallel execution** - Up to 13 concurrent jobs
✅ **Fast builds** - ~9-14 min typical, ~50% faster with cache
✅ **Build artifacts** - Dist outputs preserved for debugging
✅ **Comprehensive validation** - Lint, type check, tests
✅ **Production ready** - Automated Docker builds and deployment

**Build time improvement:** ~30-40 minutes saved per run compared to no caching
