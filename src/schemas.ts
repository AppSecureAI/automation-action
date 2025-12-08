// src/schemas.ts
// Copyright (c) 2025 AppSecAI, Inc. All rights reserved.
// This software and its source code are the proprietary information of AppSecAI, Inc.
// Unauthorized copying, modification, distribution, or use of this software is strictly prohibited.

import { z } from 'zod'

export const StepSchema = z.object({
  name: z.string(),
  status: z.string(),
  detail: z.string()
})

export const StepListSchema = z.array(StepSchema)

export const RunSummarySchema = z.object({
  total_vulnerabilities: z.number().default(0),
  true_positives: z.number().default(0),
  false_positives: z.number().default(0),
  cwe_breakdown: z.record(z.number()).default({}),
  severity_breakdown: z.record(z.number()).default({}),
  remediation_success: z.number().default(0),
  remediation_failed: z.number().default(0),
  pr_urls: z.array(z.string()).default([]),
  pr_count: z.number().default(0)
})

export const RunResponseSchema = z.object({
  message: z.string(),
  description: z.string().nullish(),
  steps: StepListSchema,
  run_id: z.string().nullable(),
  summary: RunSummarySchema.nullable().optional()
})

export const SolverResultSchema = z.object({
  count: z.number(),
  extras: z.record(z.any())
})

export const SolverResultsSchema = z.object({
  description: z.string().nullish(), // API returns null when not set
  find: SolverResultSchema.nullable(),
  triage: SolverResultSchema.nullable(),
  remediate: SolverResultSchema.nullable(),
  validate: SolverResultSchema.nullable(),
  push: SolverResultSchema.nullable()
})

/**
 * Valid status values for ProcessStatus.
 * Kept in sync with ProcessStatusValue type in types.ts.
 */
export const ProcessStatusValueSchema = z.enum([
  'not_started',
  'initiated',
  'in_progress',
  'completed',
  'failed'
])

/**
 * Schema for ProcessStatus.
 * Note: Uses lenient string type for status to remain forward-compatible
 * if the API adds new status values. The ProcessStatusValue type in types.ts
 * provides compile-time type safety for known values.
 */
export const ProcessStatusSchema = z.object({
  status: z.string().default('not_started'),
  started_at: z.string().nullish(), // API returns null, not undefined
  completed_at: z.string().nullish(), // API returns null, not undefined
  progress_percentage: z.number().default(0),
  error_message: z.string().nullish(), // API returns null, not undefined
  total_items: z.number().default(0),
  processed_items: z.number().default(0),
  success_count: z.number().default(0),
  error_count: z.number().default(0),
  false_positive_count: z.number().default(0) // Items triaged as false positives (triage only)
})

export const RunProcessTrackingSchema = z.object({
  find_status: ProcessStatusSchema.optional(),
  triage_status: ProcessStatusSchema.optional(),
  remediate_status: ProcessStatusSchema.optional(),
  validate_status: ProcessStatusSchema.optional(),
  push_status: ProcessStatusSchema.optional(),
  remediation_validation_loop_status: ProcessStatusSchema.optional(),
  grouping_status: ProcessStatusSchema.optional(),
  group_remediate_status: ProcessStatusSchema.optional(),
  group_validate_status: ProcessStatusSchema.optional(),
  overall_status: ProcessStatusSchema.optional()
})

export const ResponseStatusSchema = z.object({
  message: z.string(),
  description: z.string().nullable().optional(),
  results: SolverResultsSchema.nullable(),
  process_tracking: RunProcessTrackingSchema.nullable().optional(),
  summary: RunSummarySchema.nullable().optional()
})
