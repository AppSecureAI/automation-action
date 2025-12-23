# automation-action Versioning

This document describes versioning implementation for the automation-action repository (public GitHub Action).

## Table of Contents

- [Overview](#overview)
- [Version Sync](#version-sync)
- [Floating Tags](#floating-tags)
- [CI Workflows](#ci-workflows)
- [Version Verification](#version-verification)
- [User Configuration](#user-configuration)

---

## Overview

The automation-action is the **public mirror** of the private submit-run-action repository. Versions are synced automatically when releases are published on submit-run-action.

### Relationship

```
┌─────────────────────────────────────┐
│   submit-run-action (Private)       │
│   - Development happens here        │
│   - All CI/CD runs here             │
│   - Releases trigger sync           │
└─────────────────┬───────────────────┘
                  │
                  │ Release Published
                  │ (GitHub Webhook)
                  ▼
┌─────────────────────────────────────┐
│   automation-action (Public)        │
│   - Public mirror                   │
│   - Users reference this            │
│   - Receives synced releases        │
└─────────────────────────────────────┘
```

### What This Means

- **Development**: All code changes happen in submit-run-action
- **Releases**: Automatically synced from submit-run-action
- **Tags**: Managed by sync workflow (exact + floating)
- **Users**: Reference automation-action in their workflows

---

## Version Sync

### Sync Process

When a release is published on submit-run-action:

1. Sync workflow triggers via webhook
2. Action files copied (sensitive content excluded)
3. Matching Git tag created
4. Floating tags updated
5. GitHub Release created

### Synced Content

| Included | Excluded |
|----------|----------|
| `action.yml` | Internal CI workflows |
| `dist/` (compiled) | Development configs |
| `README.md` | Private documentation |
| `LICENSE` | Test fixtures |
| `package.json` | Source code (`src/`) |

### Sync Workflow

```yaml
# Triggered by submit-run-action release
on:
  repository_dispatch:
    types: [sync-release]

jobs:
  sync:
    steps:
      - name: Receive release data
        run: |
          VERSION="${{ github.event.client_payload.version }}"
          TAG="${{ github.event.client_payload.tag }}"

      - name: Update repository
        run: |
          # Fetch latest from submit-run-action
          # Copy allowed files
          # Commit and tag

      - name: Create release
        uses: softprops/action-gh-release@v1
        with:
          tag_name: ${{ env.TAG }}
```

---

## Floating Tags

### Tag Strategy

Users benefit from floating tags that automatically receive updates:

| Tag | Type | Updates When | Recommendation |
|-----|------|--------------|----------------|
| `v1.2.3` | Exact | Never | For reproducibility |
| `v1.2` | Minor | 1.2.4 released | Balanced |
| `v1` | Major | 1.3.0 released | **Recommended** |

### Tag Lifecycle

```
Release v1.2.3:
├─▶ Create v1.2.3 (new, immutable)
├─▶ Force-update v1.2 → v1.2.3
└─▶ Force-update v1 → v1.2.3

Release v1.2.4:
├─▶ Create v1.2.4 (new, immutable)
├─▶ Force-update v1.2 → v1.2.4
└─▶ Force-update v1 → v1.2.4

Release v1.3.0:
├─▶ Create v1.3.0 (new, immutable)
├─▶ Create v1.3 (new, floating)
└─▶ Force-update v1 → v1.3.0
```

### Why Floating Tags?

GitHub Actions best practice recommends using floating major version tags:

```yaml
# Recommended - gets patches and minor updates
- uses: AppSecureAI/automation-action@v1

# Alternative - gets only patches
- uses: AppSecureAI/automation-action@v1.2

# Not recommended - misses security patches
- uses: AppSecureAI/automation-action@v1.2.3
```

---

## CI Workflows

### Continuous Integration (ci.yml)

Validates the synced content:

```yaml
name: Continuous Integration
on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 20

      - name: Install dependencies
        run: npm ci

      - name: Run tests
        run: npm test
```

### Check Distribution (check-dist.yml)

Verifies compiled output matches source:

```yaml
name: Check Transpiled JavaScript
on:
  push:
    branches: [main]

jobs:
  check-dist:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Build
        run: npm run build

      - name: Check for changes
        run: |
          if [ -n "$(git status --porcelain dist/)" ]; then
            echo "ERROR: dist/ is out of date"
            exit 1
          fi
```

### Version Check (version-check.yml)

Validates version consistency:

```yaml
name: Version Check
on:
  push:
    branches: [main]

jobs:
  check-version:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Validate version format
        run: |
          VERSION=$(jq -r .version package.json)
          if ! [[ $VERSION =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
            echo "ERROR: Invalid version format"
            exit 1
          fi
```

---

## Version Verification

### Checking Current Version

```bash
# View latest release
gh release view --repo AppSecureAI/automation-action

# List all tags
gh api repos/AppSecureAI/automation-action/tags --jq '.[].name'

# Check what v1 points to
gh api repos/AppSecureAI/automation-action/git/refs/tags/v1 \
  --jq '.object.sha'
```

### Verifying Sync

Ensure automation-action matches submit-run-action:

```bash
# Compare versions
PRIVATE=$(gh release view --repo AppSecureAI/submit-run-action --json tagName -q .tagName)
PUBLIC=$(gh release view --repo AppSecureAI/automation-action --json tagName -q .tagName)

if [ "$PRIVATE" != "$PUBLIC" ]; then
  echo "WARNING: Version mismatch"
  echo "  submit-run-action: $PRIVATE"
  echo "  automation-action: $PUBLIC"
fi
```

---

## User Configuration

### Basic Usage

```yaml
# .github/workflows/security-scan.yml
name: Security Scan
on: [push, pull_request]

jobs:
  scan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Run AppSecAI Scan
        uses: AppSecureAI/automation-action@v1
        with:
          file: results.sarif
```

### Pinning Strategies

**Recommended (Major Version)**:
```yaml
uses: AppSecureAI/automation-action@v1
```
- Receives all updates within v1.x.x
- Best balance of stability and updates

**Conservative (Minor Version)**:
```yaml
uses: AppSecureAI/automation-action@v1.2
```
- Only receives patch updates (1.2.x)
- Manual update needed for new features

**Strict (Exact Version)**:
```yaml
uses: AppSecureAI/automation-action@v1.2.3
```
- Completely locked version
- Must manually update for any changes

### Checking for Updates

```yaml
# Use Dependabot to track updates
# .github/dependabot.yml
version: 2
updates:
  - package-ecosystem: github-actions
    directory: /
    schedule:
      interval: weekly
```

---

## CODEOWNERS

```
# .github/CODEOWNERS
* @AppSecureAI/platform-team
```

All changes require review from platform team.

---

## Version Policy

### Semantic Versioning

This action follows [Semantic Versioning](https://semver.org/):

- **MAJOR** (v2.0.0): Breaking changes to action inputs/outputs
- **MINOR** (v1.1.0): New features, backward compatible
- **PATCH** (v1.0.1): Bug fixes, backward compatible

### Breaking Changes

Breaking changes trigger a major version bump:
- Removing or renaming inputs
- Changing output format
- Dropping Node.js version support
- API contract changes

### Deprecation Policy

1. Feature marked deprecated in minor release
2. Warning added to action output
3. Removed in next major release
4. Minimum 30 days notice

---

## Troubleshooting

### Version Not Updated

If automation-action doesn't have the latest version:

1. Check submit-run-action releases
2. Verify sync workflow ran successfully
3. Check for webhook delivery issues

```bash
# View webhook deliveries
gh api repos/AppSecureAI/submit-run-action/hooks \
  --jq '.[].deliveries'
```

### Tag Resolution Issues

If `@v1` doesn't resolve correctly:

```bash
# Verify tag exists
gh api repos/AppSecureAI/automation-action/git/refs/tags/v1

# Check tag target
gh api repos/AppSecureAI/automation-action/git/tags/$(
  gh api repos/AppSecureAI/automation-action/git/refs/tags/v1 \
    --jq '.object.sha'
) --jq '.object.sha'
```

---

## Related Documentation

- [submit-run-action Versioning](https://github.com/AppSecureAI/submit-run-action/docs/VERSIONING.md)
- [GitHub Actions Versioning Best Practices](https://docs.github.com/en/actions/creating-actions/about-custom-actions#using-release-management-for-actions)
