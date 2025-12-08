// __tests__/schemas.test.ts
// Copyright (c) 2025 AppSecAI, Inc. All rights reserved.
// This software and its source code are the proprietary information of AppSecAI, Inc.
// Unauthorized copying, modification, distribution, or use of this software is strictly prohibited.

/**
 * Unit tests for src/schemas.ts
 */

import {
  RunResponseSchema,
  StepSchema,
  ResponseStatusSchema,
  StepListSchema,
  SolverResultSchema,
  SolverResultsSchema,
  ProcessStatusSchema,
  ProcessStatusValueSchema,
  RunProcessTrackingSchema
} from '../src/schemas'

// Test data factories
const createStep = (
  overrides: Partial<{ name: string; status: string; detail: string }> = {}
) => ({
  name: 'step',
  status: 'completed',
  detail: 'some detail',
  ...overrides
})

const createSolverResult = (
  overrides: Partial<{ count: number; extras: Record<string, any> }> = {}
) => ({
  count: 42,
  extras: { key: 'value', nested: { data: 'test' } },
  ...overrides
})

const createSolverResults = (
  overrides: Partial<{
    find: any
    triage: any
    remediate: any
    validate: any
    push: any
  }> = {}
) => ({
  find: createSolverResult({ count: 1, extras: { found: true } }),
  triage: createSolverResult({ count: 2, extras: { triaged: true } }),
  remediate: createSolverResult({ count: 3, extras: { remediated: true } }),
  validate: createSolverResult({ count: 4, extras: { validated: true } }),
  push: createSolverResult({ count: 5, extras: { pushed: true } }),
  ...overrides
})

const createRunResponse = (
  overrides: Partial<{
    message: string
    description: string
    steps: any[]
    run_id: string | null
    summary: any
  }> = {}
) => ({
  message: 'a message',
  description: 'description',
  steps: [createStep()],
  run_id: null,
  summary: null,
  ...overrides
})

const createResponseStatus = (
  overrides: Partial<{
    message: string
    description: string
    results: any
    summary: any
  }> = {}
) => ({
  message: 'a message',
  description: 'description',
  results: createSolverResults(),
  summary: null,
  ...overrides
})

describe('schemas.ts', () => {
  describe('StepSchema', () => {
    test('must parse correctly with valid data', () => {
      const testData = createStep()
      const parsed = StepSchema.safeParse(testData)

      expect(parsed.data).toStrictEqual(testData)
    })

    test('must fail validation with invalid data', () => {
      const parsed = StepSchema.safeParse({
        name: 'step'
        // missing status and detail
      })

      expect(parsed.success).toBe(false)
    })
  })

  describe('StepListSchema', () => {
    test('must parse correctly with valid array data', () => {
      const testData = [
        createStep({ name: 'step1', detail: 'first step detail' }),
        createStep({
          name: 'step2',
          status: 'failed',
          detail: 'second step detail'
        })
      ]
      const parsed = StepListSchema.safeParse(testData)

      expect(parsed.data).toStrictEqual(testData)
    })
  })

  describe('SolverResultSchema', () => {
    test('must parse correctly with valid data', () => {
      const testData = createSolverResult()
      const parsed = SolverResultSchema.safeParse(testData)

      expect(parsed.data).toStrictEqual(testData)
    })

    test('must fail validation with invalid data', () => {
      const parsed = SolverResultSchema.safeParse({
        count: 'not a number', // should be number
        extras: {}
      })

      expect(parsed.success).toBe(false)
    })
  })

  describe('SolverResultsSchema', () => {
    test('must parse correctly with all valid results', () => {
      const testData = createSolverResults()
      const parsed = SolverResultsSchema.safeParse(testData)

      expect(parsed.data).toStrictEqual(testData)
    })

    test('must parse correctly with null values', () => {
      const testData = createSolverResults({
        find: null,
        triage: createSolverResult({ count: 2, extras: {} }),
        remediate: null,
        validate: createSolverResult({ count: 4, extras: {} }),
        push: null
      })
      const parsed = SolverResultsSchema.safeParse(testData)

      expect(parsed.data).toStrictEqual(testData)
    })
  })

  describe('RunResponseSchema', () => {
    test('must parse correctly with null run_id', () => {
      const testData = createRunResponse()
      const parsed = RunResponseSchema.safeParse(testData)

      expect(parsed.data).toStrictEqual(testData)
    })

    test('must parse correctly with string run_id', () => {
      const testData = createRunResponse({ run_id: 'run-12345' })
      const parsed = RunResponseSchema.safeParse(testData)

      expect(parsed.data).toStrictEqual(testData)
    })

    test('must fail validation with invalid data', () => {
      const parsed = RunResponseSchema.safeParse({
        message: 'a message',
        description: 'description',
        steps: 'not an array', // should be array
        run_id: null
      })

      expect(parsed.success).toBe(false)
    })
  })

  describe('ResponseStatusSchema', () => {
    test('must parse correctly with valid results', () => {
      const testData = createResponseStatus()
      const parsed = ResponseStatusSchema.safeParse(testData)

      expect(parsed.data).toStrictEqual(testData)
    })

    test('must parse correctly with null results', () => {
      const testData = createResponseStatus({ results: null })
      const parsed = ResponseStatusSchema.safeParse(testData)

      expect(parsed.data).toStrictEqual(testData)
    })
  })

  describe('RunResponseSchema description', () => {
    test('must parse correctly with null description', () => {
      const testData = {
        message: 'a message',
        description: null,
        steps: [createStep()],
        run_id: null,
        summary: null
      }
      const parsed = RunResponseSchema.safeParse(testData)

      expect(parsed.success).toBe(true)
      expect(parsed.data?.description).toBeNull()
    })

    test('must parse correctly with undefined description', () => {
      const testData = {
        message: 'a message',
        steps: [createStep()],
        run_id: null,
        summary: null
        // description is omitted (undefined)
      }
      const parsed = RunResponseSchema.safeParse(testData)

      expect(parsed.success).toBe(true)
      expect(parsed.data?.description).toBeUndefined()
    })
  })

  describe('ProcessStatusValueSchema', () => {
    test('must parse valid status values', () => {
      const validStatuses = [
        'not_started',
        'initiated',
        'in_progress',
        'completed',
        'failed'
      ]

      validStatuses.forEach((status) => {
        const parsed = ProcessStatusValueSchema.safeParse(status)
        expect(parsed.success).toBe(true)
        expect(parsed.data).toBe(status)
      })
    })

    test('must fail validation with invalid status value', () => {
      const parsed = ProcessStatusValueSchema.safeParse('invalid_status')
      expect(parsed.success).toBe(false)
    })
  })

  describe('ProcessStatusSchema', () => {
    test('must parse correctly with full valid data', () => {
      const testData = {
        status: 'in_progress',
        started_at: '2024-01-15T10:30:00Z',
        completed_at: null,
        progress_percentage: 45.5,
        error_message: null,
        total_items: 100,
        processed_items: 45,
        success_count: 43,
        error_count: 2
      }
      const parsed = ProcessStatusSchema.safeParse(testData)

      expect(parsed.success).toBe(true)
    })

    test('must apply defaults for missing fields', () => {
      const testData = {}
      const parsed = ProcessStatusSchema.safeParse(testData)

      expect(parsed.success).toBe(true)
      expect(parsed.data?.status).toBe('not_started')
      expect(parsed.data?.progress_percentage).toBe(0)
      expect(parsed.data?.total_items).toBe(0)
      expect(parsed.data?.processed_items).toBe(0)
      expect(parsed.data?.success_count).toBe(0)
      expect(parsed.data?.error_count).toBe(0)
    })

    test('must parse correctly with completed status', () => {
      const testData = {
        status: 'completed',
        started_at: '2024-01-15T10:30:00Z',
        completed_at: '2024-01-15T11:00:00Z',
        progress_percentage: 100,
        total_items: 50,
        processed_items: 50,
        success_count: 48,
        error_count: 2
      }
      const parsed = ProcessStatusSchema.safeParse(testData)

      expect(parsed.success).toBe(true)
      expect(parsed.data?.status).toBe('completed')
    })

    test('must parse correctly with failed status and error message', () => {
      const testData = {
        status: 'failed',
        started_at: '2024-01-15T10:30:00Z',
        completed_at: '2024-01-15T10:35:00Z',
        progress_percentage: 20,
        error_message: 'Connection timeout',
        total_items: 50,
        processed_items: 10,
        success_count: 8,
        error_count: 2
      }
      const parsed = ProcessStatusSchema.safeParse(testData)

      expect(parsed.success).toBe(true)
      expect(parsed.data?.error_message).toBe('Connection timeout')
    })
  })

  describe('RunProcessTrackingSchema', () => {
    test('must parse correctly with all process statuses', () => {
      const processStatus = {
        status: 'completed',
        started_at: '2024-01-15T10:00:00Z',
        completed_at: '2024-01-15T10:30:00Z',
        progress_percentage: 100,
        total_items: 10,
        processed_items: 10,
        success_count: 10,
        error_count: 0
      }

      const testData = {
        find_status: processStatus,
        triage_status: processStatus,
        remediate_status: processStatus,
        validate_status: processStatus,
        push_status: processStatus,
        remediation_validation_loop_status: processStatus,
        grouping_status: processStatus,
        group_remediate_status: processStatus,
        group_validate_status: processStatus,
        overall_status: processStatus
      }

      const parsed = RunProcessTrackingSchema.safeParse(testData)

      expect(parsed.success).toBe(true)
    })

    test('must parse correctly with partial process statuses', () => {
      const testData = {
        find_status: {
          status: 'completed',
          total_items: 5,
          processed_items: 5
        },
        triage_status: { status: 'in_progress', progress_percentage: 50 }
        // Other statuses omitted
      }

      const parsed = RunProcessTrackingSchema.safeParse(testData)

      expect(parsed.success).toBe(true)
      expect(parsed.data?.find_status?.status).toBe('completed')
      expect(parsed.data?.triage_status?.status).toBe('in_progress')
      expect(parsed.data?.remediate_status).toBeUndefined()
    })

    test('must parse correctly with empty object', () => {
      const testData = {}
      const parsed = RunProcessTrackingSchema.safeParse(testData)

      expect(parsed.success).toBe(true)
    })
  })
})
