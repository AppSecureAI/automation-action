<p align="center">
  <img src="assets/logo.png" alt="AppSecAI Logo" width="200">
</p>

# AppSecAI Expert Fix Automation (EFA)

[![Build](https://github.com/AppSecureAI/automation-action/actions/workflows/ci.yml/badge.svg)](https://github.com/AppSecureAI/automation-action/actions/workflows/ci.yml)
[![Coverage](./badges/coverage.svg)](./badges/coverage.svg)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

This GitHub Action provides automated security vulnerability triage,
remediation, and validation powered by AI. Submit SARIF or JSON security scan
results to the AppSecAI platform for intelligent analysis of your source code.

## Quick Start

```yaml
- name: AppSecAI Expert Fix Automation
  uses: AppSecureAI/automation-action@v1
  with:
    file: sarif-results.sarif
```

## Prerequisites

Before using this action, install the
[AppSecAI App](https://github.com/apps/appsecai-app) GitHub App and grant it
access to your repository.

1. **Install the App:**
   [Click here to install](https://github.com/apps/appsecai-app)
2. **Grant repository access:** Ensure the app has access to your target
   repository

## Inputs

| Input            | Description                                               | Required | Default |
| ---------------- | --------------------------------------------------------- | -------- | ------- |
| `file`           | SARIF or JSON file path containing scan results           | Yes      | -       |
| `update-context` | Trigger fresh security context extraction before the scan | No       | `false` |

## Configuration

Configure the action behavior using environment variables in your workflow:

| Environment Variable                        | Description                                                                                                            | Default      |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ------------ |
| `CREATE_ISSUES_FOR_INCOMPLETE_REMEDIATIONS` | Create GitHub Issues instead of PRs for incomplete remediations (Self-Validation Warning, Additional Context Required) | `true`       |
| `COMMENT_MODIFICATION_MODE`                 | Controls comment modification in fix PRs. `basic` preserves existing comments; `verbose` may add/modify comments       | `basic`      |
| `AUTO_CREATE_PRS`                           | Automatically create PRs for remediations                                                                              | `true`       |
| `PROCESSING_MODE`                           | Processing mode for vulnerability analysis                                                                             | `individual` |
| `UPDATE_CONTEXT`                            | Trigger fresh security context extraction (same as `update-context` input)                                             | `false`      |

## Outputs

| Output            | Description                                           |
| ----------------- | ----------------------------------------------------- |
| `message`         | Processed message from the action                     |
| `context-updated` | Whether context was updated (true/false/rate-limited) |

## Usage

### Step 1: Add Required Permissions

```yaml
permissions:
  contents: read
  id-token: write
```

### Step 2: Add the Action

```yaml
- name: AppSecAI Security Analysis
  uses: AppSecureAI/automation-action@v1
  with:
    file: scan-results.sarif
```

### Using a Specific Version

We recommend using the major version tag (`@v1`) for stability. You can also pin
to a specific version:

```yaml
uses: AppSecureAI/automation-action@v1      # Recommended: latest v1.x
uses: AppSecureAI/automation-action@v1.2    # Latest v1.2.x
uses: AppSecureAI/automation-action@v1.0.0  # Pin to specific version
```

Floating tags are updated automatically on each new SemVer release tag.

## Release Notes and Changelog

Releases and `CHANGELOG.md` are generated from Conventional Commit history.

- Commit subjects must follow Conventional Commits (validated in CI), for
  example:
  - `feat: add release automation`
  - `fix(ci): validate release workflow checks`
- On SemVer tag push (`vX.Y.Z`), release workflow:
  - updates floating tags (`vX`, `vX.Y`)
  - regenerates and commits `CHANGELOG.md`
  - publishes GitHub release notes

See the
[Releases page](https://github.com/AppSecureAI/automation-action/releases) for
all available versions.

## Public Mirror Sync

This private repository automatically syncs releases to the public
`AppSecureAI/automation-action` repository.

- Trigger: `publish-public-release.yml` on private release publication
- Sync: runs `scripts/publish-public.sh --push --tag vX.Y.Z`
- Result:
  - updates public `main` with allowed files from `.publicrelease`
  - creates/updates matching tag in public repository
  - creates/updates public GitHub release notes for the same tag

Required Actions secret:

- `AUTOMATION_ACTION_TOKEN` (preferred) or legacy `PUBLIC_REPO_TOKEN`

## Examples

### Basic Usage with Bandit

```yaml
name: Security Scan

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  security-scan:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      id-token: write

    steps:
      - uses: actions/checkout@v4

      - name: Set up Python
        uses: actions/setup-python@v5
        with:
          python-version: '3.11'

      - name: Install and Run Bandit
        run: |
          pip install bandit
          bandit -r . --exit-zero -ll -f json -o bandit_results.json \
            -x "tests/*,test/*,venv/*"

      - name: AppSecAI Security Analysis
        uses: AppSecureAI/automation-action@v1
        with:
          file: bandit_results.json
```

### Advanced Configuration

```yaml
name: Security Scan with Configuration

on: [push]

jobs:
  security-scan:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      id-token: write

    steps:
      - uses: actions/checkout@v4

      - name: Run Security Scan
        run: semgrep --config=auto --json > semgrep_results.json

      - name: AppSecAI Security Analysis
        uses: AppSecureAI/automation-action@v1
        with:
          file: semgrep_results.json
        env:
          # Create GitHub Issues for incomplete remediations instead of PRs
          CREATE_ISSUES_FOR_INCOMPLETE_REMEDIATIONS: 'true'
          # Use minimal comment modifications in PRs
          COMMENT_MODIFICATION_MODE: 'basic'
```

### Importing Pre-Generated Results

Use this pattern when your scanner runs in a different workflow or external
pipeline and the results file is already committed to the repository.

```yaml
name: Process Existing SAST Results

permissions:
  contents: read
  id-token: write

on:
  workflow_dispatch:

jobs:
  process-results:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout repository
        uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: AppSecAI Security Analysis
        uses: AppSecureAI/automation-action@v1
        with:
          file: sast/bandit-report.json
```

Notes:

- The SAST file must already exist in the repository.
- This workflow does not run a scanner; it only uploads existing results.
- `file` is a path relative to the repository root.

### Using Semgrep

```yaml
- name: Run Semgrep
  run: semgrep --config=auto --json > semgrep_results.json

- name: AppSecAI Analysis
  uses: AppSecureAI/automation-action@v1
  with:
    file: semgrep_results.json
```

### Triggering Fresh Security Context Extraction

Use the `update-context` input to request fresh security context extraction
before the scan. This is useful after significant code changes or when security
policies have been updated.

```yaml
- name: AppSecAI Analysis with Context Update
  uses: AppSecureAI/automation-action@v1
  with:
    file: scan-results.sarif
    update-context: true
```

Note: Context updates are subject to a 24-hour rate limit. If rate limited, the
action will log a warning and continue with existing context.

## Supported SAST Tools

This action works with output from various static analysis tools:

- [Bandit](https://bandit.readthedocs.io/) (Python)
- [Semgrep](https://semgrep.dev/) (Multiple Languages)
- [CodeQL](https://codeql.github.com/) (Multiple Languages)
- Any tool outputting SARIF or compatible JSON format

### Generating Input Files

**Bandit (JSON):**

```sh
bandit -r . -f json -o bandit_results.json
```

**Semgrep (JSON):**

```sh
semgrep --config=auto --json > semgrep_results.json
```

**CodeQL (SARIF):**

```sh
codeql database analyze <db> <qlpack> --format=sarifv2.1.0 --output=codeql-results.sarif
```

## Troubleshooting

### Permissions Error

**Problem:** `Resource not accessible by integration` or similar permission
errors.

**Solution:** Add required permissions to your workflow:

```yaml
permissions:
  contents: read
  id-token: write
```

### App Not Installed

**Problem:** Authentication or API access denied errors.

**Solution:** Install the [AppSecAI App](https://github.com/apps/appsecai-app)
GitHub App and grant it access to your repository.

### File Not Found

**Problem:** `Empty file` or `File not found` errors.

**Solution:**

- Verify the `file` input path is correct
- Ensure the SAST tool runs before this action
- Check that the output file exists at the specified location

### Still Having Issues?

[Open an issue](https://github.com/AppSecureAI/automation-action/issues) with
your workflow configuration and error messages.

## Documentation

For comprehensive documentation, visit the
[AppSecAI Documentation](https://portal.cloud.appsecai.io/docs).

## Contributing

Contributions are welcome! Please see our
[Contributing Guidelines](CONTRIBUTING.md) for details.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file
for details.
