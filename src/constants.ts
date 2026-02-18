// src/constants.ts
// Copyright (c) 2025 AppSecAI, Inc. All rights reserved.
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
export const BILLING_URL = 'https://app.appsecai.net/settings/billing'
export const SUPPORT_EMAIL = 'support@appsecai.io'
export const STATUS_PAGE_URL = 'https://status.appsecai.net'

/**
 * Polling configuration for status checks
 */
export const PollingConfig = {
  /** Wait time between status check attempts (30 seconds) */
  POLL_DELAY_MS: 30000,
  /** Display progress messages every 30 seconds during submission */
  INTERVAL_CHECK_MS: 30000,
  /** Maximum number of polling attempts (100 retries × 30s = ~50 minutes total) */
  MAX_RETRIES: 100,
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
