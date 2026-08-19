import { z } from 'zod';

export const emailSchema = z.string().trim().toLowerCase().email().max(255);

export const passwordSchema = z
  .string()
  .min(8, 'at least 8 characters')
  .max(72, 'at most 72 characters')
  .regex(/[a-zA-Z]/, 'at least one letter')
  .regex(/[0-9]/, 'at least one number');

export const nameSchema = z.string().trim().min(1).max(80);

export const roleSchema = z.enum(['admin', 'user', 'viewer']);

export const workOrderStatusSchema = z.enum(['pending', 'in_progress', 'done']);
export const workOrderPrioritySchema = z.enum(['low', 'medium', 'high']);

// ── Auth ──────────────────────────────────────────────────────────────

export const registerSchema = z
  .object({
    email: emailSchema,
    password: passwordSchema,
    name: nameSchema,
  })
  .strict();

export const loginSchema = z
  .object({
    email: z.string().trim().toLowerCase().max(255),
    password: z.string().min(1).max(72),
  })
  .strict();

export const forgotPasswordSchema = z
  .object({
    email: z.string().trim().toLowerCase().max(255),
  })
  .strict();

export const resetPasswordSchema = z
  .object({
    token: z.string().min(1).max(128),
    password: passwordSchema,
  })
  .strict();

// ── Work orders ──────────────────────────────────────────────────────

export const createWorkOrderSchema = z
  .object({
    title: z.string().trim().min(3).max(100),
    description: z.string().trim().max(2000).nullable().optional(),
    priority: workOrderPrioritySchema.optional().default('medium'),
    status: workOrderStatusSchema.optional().default('pending'),
  })
  .strict();

export const updateWorkOrderSchema = z
  .object({
    title: z.string().trim().min(3).max(100).optional(),
    description: z.string().trim().max(2000).nullable().optional(),
    priority: workOrderPrioritySchema.optional(),
    status: workOrderStatusSchema.optional(),
    version: z.number().int().min(1),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 1, { message: 'at least one field besides version is required' });

export const deleteWorkOrderSchema = z
  .object({
    version: z.number().int().min(1),
  })
  .strict();

// ── Profile ──────────────────────────────────────────────────────────

export const updateProfileSchema = z
  .object({
    name: nameSchema,
  })
  .strict();

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1).max(72),
    newPassword: passwordSchema,
  })
  .strict();

// ── Admin ────────────────────────────────────────────────────────────

export const updateRoleSchema = z
  .object({
    role: roleSchema,
  })
  .strict();

export const updateStatusSchema = z
  .object({
    isActive: z.boolean(),
  })
  .strict();

export const updateAiSchema = z
  .object({
    aiEnabled: z.boolean(),
  })
  .strict();

// ── Query params ─────────────────────────────────────────────────────

export const cursorQuerySchema = z.object({
  cursor: z.string().max(1024).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: workOrderStatusSchema.optional(),
  priority: workOrderPrioritySchema.optional(),
  search: z.string().trim().max(64).optional(),
});

export const offsetQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  role: roleSchema.optional(),
  search: z.string().trim().max(64).optional(),
});

// ── Agentic AI ─────────────────────────────────────────────────────────────

// LLM-facing tool arg schemas. `version` and `owner` are intentionally absent:
// the runtime injects them (see agent spec §4.3).

export const aiListWorkOrdersSchema = z
  .object({
    status: workOrderStatusSchema.optional(),
    priority: workOrderPrioritySchema.optional(),
    search: z.string().trim().max(64).optional(),
  })
  .strict();

export const aiGetWorkOrderSchema = z
  .object({
    id: z.string().min(1),
  })
  .strict();

export const aiCreateWorkOrderSchema = createWorkOrderSchema;

export const aiUpdateWorkOrderSchema = z
  .object({
    id: z.string().min(1),
    title: z.string().trim().min(3).max(100).optional(),
    description: z.string().trim().max(2000).nullable().optional(),
    priority: workOrderPrioritySchema.optional(),
    status: workOrderStatusSchema.optional(),
  })
  .strict()
  .refine((v) => v.title !== undefined || v.description !== undefined || v.priority !== undefined || v.status !== undefined, {
    message: 'at least one field to update is required',
  });

export const aiDeleteWorkOrderSchema = z
  .object({
    id: z.string().min(1),
  })
  .strict();

export const triageProposalSchema = z
  .object({
    summary: z.string().trim().min(1).max(200),
    suggestedPriority: workOrderPrioritySchema,
    flagForDispatcher: z.boolean(),
  })
  .strict();

export const sendCopilotMessageSchema = z
  .object({
    content: z.string().trim().min(1).max(4000),
  })
  .strict();

// ── SSE event payloads (agent spec §4.8) ──────────────────────────────────

export const sseEventSchema = z.discriminatedUnion('event', [
  z.object({ event: z.literal('token'), content: z.string() }),
  z.object({ event: z.literal('tool_call_start'), toolCallId: z.string(), tool: z.string(), args: z.unknown() }),
  z.object({
    event: z.literal('tool_approval_required'),
    toolCallId: z.string(),
    tool: z.string(),
    args: z.unknown(),
    preImage: z.unknown().nullable(),
    afterDiff: z.unknown(),
    summary: z.string(),
    expiresAt: z.string(),
  }),
  z.object({ event: z.literal('tool_approval_expired'), toolCallId: z.string() }),
  z.object({
    event: z.literal('tool_result'),
    toolCallId: z.string(),
    outcome: z.string(),
    result: z.unknown().optional(),
  }),
  z.object({
    event: z.literal('message_done'),
    runId: z.string(),
    content: z.string(),
    inputTokens: z.number().int().nonnegative(),
    outputTokens: z.number().int().nonnegative(),
  }),
  z.object({ event: z.literal('error'), code: z.string(), message: z.string(), requestId: z.string() }),
  z.object({ event: z.literal('ping'), ts: z.string() }),
]);

export type SseEvent = z.infer<typeof sseEventSchema>;

// ── Inferred input types ─────────────────────────────────────────────

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
export type CreateWorkOrderInput = z.infer<typeof createWorkOrderSchema>;
export type UpdateWorkOrderInput = z.infer<typeof updateWorkOrderSchema>;
export type DeleteWorkOrderInput = z.infer<typeof deleteWorkOrderSchema>;
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
export type UpdateRoleInput = z.infer<typeof updateRoleSchema>;
export type UpdateStatusInput = z.infer<typeof updateStatusSchema>;
export type UpdateAiInput = z.infer<typeof updateAiSchema>;
export type CursorQuery = z.infer<typeof cursorQuerySchema>;
export type OffsetQuery = z.infer<typeof offsetQuerySchema>;
export type AiListWorkOrdersInput = z.infer<typeof aiListWorkOrdersSchema>;
export type AiGetWorkOrderInput = z.infer<typeof aiGetWorkOrderSchema>;
export type AiCreateWorkOrderInput = z.infer<typeof aiCreateWorkOrderSchema>;
export type AiUpdateWorkOrderInput = z.infer<typeof aiUpdateWorkOrderSchema>;
export type AiDeleteWorkOrderInput = z.infer<typeof aiDeleteWorkOrderSchema>;
export type TriageProposal = z.infer<typeof triageProposalSchema>;
export type SendCopilotMessageInput = z.infer<typeof sendCopilotMessageSchema>;
