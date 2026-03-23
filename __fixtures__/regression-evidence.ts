// __fixtures__/regression-evidence.ts
// Copyright (c) 2025 AppSecAI, Inc. All rights reserved.
// This software and its source code are the proprietary information of AppSecAI, Inc.
// Unauthorized copying, modification, distribution, or use of this software is strictly prohibited.

import { jest } from '@jest/globals'

export const generateRegressionEvidence = jest.fn<
  () => Promise<{
    artifact: { status: string }
    markdown: string
    jsonPath: string
    markdownPath: string
  }>
>()
export const parseRegressionEvidenceArtifactListInput =
  jest.fn<(raw: string) => string[]>()
export const parseRegressionEvidenceTestCommandsInput =
  jest.fn<(raw: string) => string[]>()
export const publishRegressionEvidenceCommentFromContext =
  jest.fn<
    (
      markdown: string,
      token: string
    ) => Promise<'created' | 'updated' | 'skipped'>
  >()
