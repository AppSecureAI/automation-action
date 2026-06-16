// src/constants.ts
// Copyright (c) 2026 AppSecAI, Inc. All rights reserved.
// This software and its source code are the proprietary information of AppSecAI, Inc.
// Unauthorized copying, modification, distribution, or use of this software is strictly prohibited.

export const LogLabels = {
  FILE_READ: 'Analysis File',
  RUN_SUBMIT: 'Submit Analysis for Processing',
  RUN_STATUS: 'Analysis Processing Status',
  RUN_FINALIZE: 'FINALIZE',
  RUN_SUMMARY: 'SUMMARY'
} as const

export type LogLabelKey = keyof typeof LogLabels

/**
 * AppSecAI branding constants
 */
export const APPSECAI_WEBSITE_URL = 'https://www.appsecai.io/'

/**
 * URLs and contact info for user guidance in error messages
 */
export const SUPPORT_EMAIL = 'support@appsecai.io'
export const DOCS_URL = 'https://docs.appsecai.io'

/**
 * Public install page for the AppSecAI GitHub App. Linked from authentication
 * and access guidance so users can install/verify the App directly.
 */
export const APP_INSTALL_URL = 'https://github.com/apps/appsecai-app'

/**
 * Machine-readable error code returned by Hydra (HTTP 403) when the AppSecAI
 * GitHub App cannot push to the target repository. Locked contract shared with
 * Hydra (AppSecureAI/Hydra#1025).
 */
export const REPO_ACCESS_MISSING_CODE = 'github_app_repo_access_missing'

/**
 * Troubleshooting guidance for common error scenarios
 */
export const TroubleshootingGuidance = {
  SARIF_UPLOAD: [
    'Verify your SARIF file is valid JSON and follows the SARIF 2.1.0 schema',
    'Ensure the file size is under 50MB',
    'Check that your organization has an active AppSecAI subscription',
    `Contact support at ${SUPPORT_EMAIL} if the issue persists`
  ],
  CODE_UPLOAD: [
    'Verify the repository is accessible with the provided credentials',
    'Check that the branch exists and is not protected',
    'Ensure the repository is not empty'
  ],
  AUTHENTICATION: [
    'Verify your GitHub App installation is active',
    'Check that the repository has the AppSecAI GitHub App installed',
    'Ensure your API credentials are valid and not expired'
  ],
  GENERIC: [
    'Wait a few minutes and retry your request',
    `Contact support at ${SUPPORT_EMAIL} if the issue persists`
  ]
} as const

/**
 * Polling configuration for status checks
 */
export const PollingConfig = {
  /** Wait time between status check attempts (30 seconds) */
  POLL_DELAY_MS: 30000,
  /** Display progress messages every 30 seconds during submission */
  INTERVAL_CHECK_MS: 30000,
  /** Maximum number of polling attempts (240 retries × 30s = ~2 hours total) */
  MAX_RETRIES: 240,
  /** HTTP timeout for status endpoint calls (15 seconds) */
  STATUS_TIMEOUT_MS: 15000
} as const

/**
 * ASCII art logo for console output
 */
export const APPSECAI_ASCII_LOGO = `        /\\
       /  \\
      /    \\
     /  (◉) \\
    /__/  \\__\\
     AppSecAI`

/**
 * Get the full branding block with logo and website link for console output
 */
export function getConsoleBranding(): string {
  return `${APPSECAI_ASCII_LOGO}\n  ${APPSECAI_WEBSITE_URL}`
}

/**
 * Get the branding block formatted for markdown (job summary)
 */
export function getMarkdownBranding(): string {
  return `\`\`\`
${APPSECAI_ASCII_LOGO}
\`\`\`
[Visit AppSecAI](${APPSECAI_WEBSITE_URL})`
}
