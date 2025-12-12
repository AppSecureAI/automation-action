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
