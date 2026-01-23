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

/**
 * Schema for quota usage information.
 * Validates the quota_info object returned in 402 responses.
 */
export const QuotaInfoSchema = z.object({
  used: z.number(),
  limit: z.number(),
  resource: z.string()
})

/**
 * Schema for structured error details returned by the API.
 * Used to validate error responses and extract actionable information.
 */
export const StructuredErrorDetailSchema = z.object({
  code: z.string().optional(),
  description: z.string().optional(),
  organization_id: z.string().optional(),
  assignment_id: z.string().optional(),
  expires_at: z.string().optional(),
  period_end: z.string().optional(),
  status: z.string().optional(),
  steps: StepListSchema.optional(),
  owner: z.string().optional(),
  owner_type: z.string().optional(),
  quota_info: QuotaInfoSchema.optional()
})

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
  success_count: z.number().default(0), // Successfully processed items (includes warnings)
  error_count: z.number().default(0), // Actual processing exceptions
  false_positive_count: z.number().default(0), // Items triaged as false positives (triage only)
  self_validation_warning_count: z.number().default(0), // PRs created with validation warnings
  self_validation_failure_count: z.number().default(0), // Validation failures preventing PR creation
  additional_context_required_count: z.number().default(0) // PRs with 'Additional Context Required' prefix
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
  run_status: z.string().nullable().optional(),
  results: SolverResultsSchema.nullable(),
  process_tracking: RunProcessTrackingSchema.nullable().optional(),
  summary: RunSummarySchema.nullable().optional()
})

/**
 * Schema for quota-related error details (HTTP 429).
 * Validates the structured error response from the API.
 */
export const QuotaErrorDetailSchema = z.object({
  error: z.string().optional(),
  message: z.string().optional(),
  quota_used: z.number().optional(),
  quota_limit: z.number().optional(),
  period_start: z.string().optional(),
  period_end: z.string().optional()
})
