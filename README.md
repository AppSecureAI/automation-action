<p align="center">
  <img src="assets/logo.png" alt="AppSecAI Logo" width="200">
</p>

# AppSecAI Vulnerability Analysis

[![Build](https://github.com/AppSecureAI/automation-action/actions/workflows/ci.yml/badge.svg)](https://github.com/AppSecureAI/automation-action/actions/workflows/ci.yml)
[![Coverage](./badges/coverage.svg)](./badges/coverage.svg)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

AppSecAI runs after your SAST scanner. Your workflow runs a scanner, writes a
SARIF, JSON, CSV, TSV, or XML report file, then submits that report file to
AppSecAI for vulnerability triage, remediation, and validation. AppSecAI can
combine multiple scanner outputs in one run and can open remediation pull
requests when configured to do so.

For the full setup guide, supported scanner examples, and troubleshooting, see
[AppSecAI GitHub Action documentation](https://portal.cloud.appsecai.io/docs/configuration).

## First Workflow

Install the [AppSecAI GitHub App](https://github.com/apps/appsecai-app), grant
it access to the repository, then create `.github/workflows/appsecai-scan.yml`
with this starter workflow:

```yaml
name: AppSecAI Security Analysis

on:
  workflow_dispatch:
  push:
    branches: [main]

permissions:
  contents: read
  id-token: write

env:
  OPENGREP_VERSION: 'v1.16.1'

jobs:
  analyze:
    runs-on: ubuntu-latest
    env:
      PROCESSING_MODE: group_cc
      AUTO_CREATE_PRS: 'true'
    steps:
      - name: Checkout repository
        uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: Download OpenGrep
        run: |
          curl -sL "https://github.com/opengrep/opengrep/releases/download/${OPENGREP_VERSION}/opengrep_manylinux_x86" -o opengrep
          chmod +x opengrep

      - name: Run OpenGrep
        run: |
          ./opengrep scan --sarif --sarif-output=opengrep-results.sarif --config auto . || true

      - name: AppSecAI Vulnerability Analysis
        uses: AppSecureAI/automation-action@v1
        with:
          file: opengrep-results.sarif
```

Run the workflow manually from the GitHub Actions tab for the first scan. The
scanner step creates `opengrep-results.sarif`; AppSecAI reads that file and may
open remediation pull requests for fixable vulnerabilities because
`AUTO_CREATE_PRS` is set to `"true"`.

## Multi-Scanner Runs

Use `files` when one workflow produces more than one scanner report. Provide
`file` or `files`, not both.

```yaml
jobs:
  analyze:
    runs-on: ubuntu-latest
    env:
      PROCESSING_MODE: group_cc
      AUTO_CREATE_PRS: 'true'
    steps:
      - name: AppSecAI Vulnerability Analysis
        uses: AppSecureAI/automation-action@v1
        with:
          files: |
            opengrep-results.sarif
            bandit-results.json
            codeql-results/javascript.sarif
```

Simple glob patterns are supported:

```yaml
jobs:
  analyze:
    runs-on: ubuntu-latest
    env:
      PROCESSING_MODE: group_cc
      AUTO_CREATE_PRS: 'true'
    steps:
      - name: AppSecAI Vulnerability Analysis
        uses: AppSecureAI/automation-action@v1
        with:
          files: |
            security-results/*.sarif
            security-results/**/*.json
```

## Common Options

| Setting                                     | Type  | Description                                                                                                              | Default         |
| ------------------------------------------- | ----- | ------------------------------------------------------------------------------------------------------------------------ | --------------- |
| `file`                                      | input | One SARIF, JSON, CSV, TSV, or XML report to submit.                                                                      | unset           |
| `files`                                     | input | Newline- or comma-separated report paths for a multi-scanner run.                                                        | unset           |
| `update-context`                            | input | Request fresh repository security context before the scan.                                                               | `false`         |
| `allow-missing-repo-access`                 | input | Start the run even if the AppSecAI GitHub App cannot yet push to the target repository (see below).                      | `false`         |
| `PR_AUDIENCE`                               | env   | Ordered reviewer audiences for generated remediation PR content, for example `security,engineering`.                     | unset           |
| `PROCESSING_MODE`                           | env   | Processing mode. Use `group_cc` to group related findings into fewer remediation pull requests.                          | `individual_cc` |
| `AUTO_CREATE_PRS`                           | env   | Open remediation pull requests when fixes are ready.                                                                     | `false`         |
| `CREATE_ISSUES_FOR_INCOMPLETE_REMEDIATIONS` | env   | Create GitHub Issues for eligible remediation outcomes that do not produce PRs, such as remediation validation failures. | `false`         |
| `COMMENT_MODIFICATION_MODE`                 | env   | Controls how existing comments are preserved when remediation changes are prepared.                                      | `basic`         |

Advanced settings such as grouping strategy, maximum vulnerabilities per PR, and
regression evidence are documented in the
[configuration guide](https://portal.cloud.appsecai.io/docs/configuration).
Scanner-specific examples are in the
[scanner examples](https://portal.cloud.appsecai.io/docs/configuration#scanner-examples),
and grouping details are in the
[grouping strategies guide](https://portal.cloud.appsecai.io/docs/grouping-strategies).

## Starting a Run Before the Repository Is Added to the GitHub App

Before a run starts, AppSecAI verifies that the AppSecAI GitHub App can push
fixes to the target repository. If the App cannot push, the action **fails
fast** with an actionable message naming the repository and how to fix it —
instead of running for hours and failing only when pull requests are pushed.

The most common case is a **licensed organization with the App installed, where
the specific repository simply has not been added to the App yet**. For that
case, set `allow-missing-repo-access: true` to start the run now. The analysis
runs immediately, and the remediation pull requests are delivered once the
repository is added to the AppSecAI GitHub App installation.

```yaml
- name: AppSecAI Analysis (start before repo is added to the App)
  uses: AppSecureAI/automation-action@v1
  env:
    AUTO_CREATE_PRS: 'true'
  with:
    file: scan-results.sarif
    allow-missing-repo-access: true
```

When `allow-missing-repo-access` is set, the action logs a warning that the run
is starting without verified push access and that fixes will not be delivered
until the repository is added to the App. When left at the default (`false`),
the action fails fast with a clear, actionable message if the App lacks push
access.

## Supported Inputs

AppSecAI can process scanner outputs in SARIF, JSON, CSV, TSV, and XML formats.
Common sources include Semgrep, OpenGrep, Bandit, CodeQL, and other tools that
export compatible vulnerability reports.

## Results

After a run completes, review GitHub Actions logs, AppSecAI portal results, and
any pull requests or issues created by the action. For help interpreting
findings and fix outcomes, see the
[results guide](https://portal.cloud.appsecai.io/docs/results).

## Troubleshooting

- `Resource not accessible by integration`: confirm the workflow has
  `contents: read` and `id-token: write` permissions.
- Authentication or API errors: confirm the AppSecAI GitHub App is installed and
  has access to the repository.
- `GITHUB APP CANNOT PUSH TO THE TARGET REPOSITORY`: add the repository to the
  AppSecAI GitHub App installation, or set `allow-missing-repo-access: true` to
  start the run before access is granted.
- `File not found` or `Empty file`: confirm the scanner step ran before this
  action and wrote the report path passed to `file` or `files`.
- `RECONCILIATION_ACTIVE_AFTER_RUN_COMPLETED`: AppSecAI finished analysis, but
  pull request or issue artifacts are still being persisted. The action keeps
  polling for a bounded reconciliation window so final PR and issue counts are
  complete before the job summary is finalized.

For more help, see the
[troubleshooting guide](https://portal.cloud.appsecai.io/docs/troubleshooting)
or [open an issue](https://github.com/AppSecureAI/automation-action/issues).

## Version Pinning

Use the major version tag for the latest compatible v1 release:

```yaml
uses: AppSecureAI/automation-action@v1
```

For stricter reproducibility, pin to a specific release tag from the
[releases page](https://github.com/AppSecureAI/automation-action/releases).

## License

This project is licensed under the MIT License. See [LICENSE](LICENSE) for
details.
