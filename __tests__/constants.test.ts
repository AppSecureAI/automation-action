// __tests__/constants.test.ts
// Copyright (c) 2025 AppSecAI, Inc. All rights reserved.
// This software and its source code are the proprietary information of AppSecAI, Inc.
// Unauthorized copying, modification, distribution, or use of this software is strictly prohibited.

import {
  LogLabels,
  APPSECAI_WEBSITE_URL,
  APPSECAI_ASCII_LOGO,
  getConsoleBranding,
  getMarkdownBranding,
  BILLING_URL,
  SUPPORT_EMAIL,
  STATUS_PAGE_URL,
  PollingConfig
} from '../src/constants'

describe('constants.ts', () => {
  describe('LogLabels', () => {
    it('exports expected log labels', () => {
      expect(LogLabels.FILE_READ).toBe('Analysis File')
      expect(LogLabels.RUN_SUBMIT).toBe('Submit Analysis for Processing')
      expect(LogLabels.RUN_STATUS).toBe('Analysis Processing Status')
      expect(LogLabels.RUN_FINALIZE).toBe('FINALIZE')
      expect(LogLabels.RUN_SUMMARY).toBe('SUMMARY')
    })
  })

  describe('Branding constants', () => {
    it('exports website URL', () => {
      expect(APPSECAI_WEBSITE_URL).toBe('https://www.appsecai.io/')
    })

    it('exports ASCII logo with expected structure', () => {
      expect(APPSECAI_ASCII_LOGO).toContain('/\\')
      expect(APPSECAI_ASCII_LOGO).toContain('(◉)')
      expect(APPSECAI_ASCII_LOGO).toContain('AppSecAI')
      expect(APPSECAI_ASCII_LOGO).toContain('/__/  \\__\\')
    })
  })

  describe('getConsoleBranding', () => {
    it('returns logo with website URL', () => {
      const result = getConsoleBranding()
      expect(result).toContain(APPSECAI_ASCII_LOGO)
      expect(result).toContain(APPSECAI_WEBSITE_URL)
    })

    it('has website URL on separate line after logo', () => {
      const result = getConsoleBranding()
      expect(result).toContain('AppSecAI\n')
      expect(result).toContain('https://www.appsecai.io/')
    })
  })

  describe('getMarkdownBranding', () => {
    it('returns logo in code block', () => {
      const result = getMarkdownBranding()
      expect(result).toContain('```')
      expect(result).toContain(APPSECAI_ASCII_LOGO)
    })

    it('includes clickable link to website', () => {
      const result = getMarkdownBranding()
      expect(result).toContain('[Visit AppSecAI](https://www.appsecai.io/)')
    })

    it('has proper markdown formatting', () => {
      const result = getMarkdownBranding()
      // Should start with code block
      expect(result.startsWith('```')).toBe(true)
      // Should have closing code block before link
      expect(result).toMatch(/```\n\[Visit AppSecAI\]/)
    })
  })

  describe('URL and contact constants', () => {
    it('exports billing URL', () => {
      expect(BILLING_URL).toBe('https://app.appsecai.net/settings/billing')
    })

    it('exports support email', () => {
      expect(SUPPORT_EMAIL).toBe('support@appsecai.io')
    })

    it('exports status page URL', () => {
      expect(STATUS_PAGE_URL).toBe('https://status.appsecai.net')
    })
  })

  describe('PollingConfig', () => {
    it('exports poll delay in milliseconds', () => {
      expect(PollingConfig.POLL_DELAY_MS).toBe(30000)
    })

    it('exports interval check in milliseconds', () => {
      expect(PollingConfig.INTERVAL_CHECK_MS).toBe(30000)
    })

    it('exports max retries count', () => {
      expect(PollingConfig.MAX_RETRIES).toBe(50)
    })

    it('has configuration for approximately 25 minutes of polling', () => {
      // 50 retries × 30 seconds = 1500 seconds = 25 minutes
      const totalPollingTimeMs =
        PollingConfig.MAX_RETRIES * PollingConfig.POLL_DELAY_MS
      const totalPollingMinutes = totalPollingTimeMs / 1000 / 60
      expect(totalPollingMinutes).toBe(25)
    })
  })
})
