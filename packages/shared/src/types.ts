export type Role = 'admin' | 'user' | 'viewer';

export type WorkOrderStatus = 'pending' | 'in_progress' | 'done';

export type WorkOrderPriority = 'low' | 'medium' | 'high';

export interface UserPublic {
  id: string;
  email: string;
  name: string;
  role: Role;
  createdAt: string;
  updatedAt: string;
}

export interface UserAdmin extends UserPublic {
  isActive: boolean;
  lastLoginAt: string | null;
  aiEnabled: boolean;
}

export interface WorkOrderPublic {
  id: string;
  title: string;
  description: string | null;
  priority: WorkOrderPriority;
  status: WorkOrderStatus;
  owner: { id: string; name: string; email: string };
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface CursorPage<T> {
  items: T[];
  nextCursor: string | null;
}

export interface OffsetPage<T> {
  items: T[];
  page: number;
  limit: number;
  total: number;
}

export type ErrorCode =
  | 'VALIDATION_ERROR'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT_VERSION'
  | 'RATE_LIMITED'
  | 'ACCOUNT_LOCKED'
  | 'AUTH_GENERIC'
  | 'EMAIL_TAKEN'
  | 'REFRESH_REUSE'
  | 'INTERNAL'
  | 'AI_UNAVAILABLE'
  | 'AI_BUDGET_EXCEEDED'
  | 'AI_APPROVAL_PENDING'
  | 'AI_APPROVAL_RESOLVED'
  | 'AI_APPROVAL_STALE'
  | 'AI_APPROVAL_EXPIRED'
  | 'AI_MESSAGE_DUPLICATE'
  | 'AI_INJECTION_BLOCKED';

export interface ApiErrorBody {
  code: ErrorCode;
  message: string;
  details?: { field: string; message: string }[];
}

export interface SuccessEnvelope<T> {
  success: true;
  data: T;
}

export interface ErrorEnvelope {
  success: false;
  error: ApiErrorBody;
  requestId: string;
}

export interface Metrics {
  users: number;
  workOrders: number;
  uptimeSeconds: number;
}

export interface OkResponse {
  ok: true;
}

export interface HealthResponse {
  status: 'ok';
}

export interface ReadyResponse {
  status: 'ok' | 'degraded';
}

export const ACCESS_COOKIE = 'access_token';
export const REFRESH_COOKIE = 'refresh_token';
export const ACCESS_TOKEN_TTL_SECONDS = 900;
export const REFRESH_TOKEN_TTL_SECONDS = 604800;

export const APP_ISS = 'workorders';
export const APP_AUD = 'workorders-api';

// ── Agentic AI ─────────────────────────────────────────────────────────────

export type CopilotSessionStatus = 'active' | 'archived' | 'expired';

export interface CopilotSession {
  id: string;
  userId: string;
  status: CopilotSessionStatus;
  createdAt: string;
  updatedAt: string;
}

export type AgentRunMode = 'copilot' | 'autonomous';

export type AgentRunStatus = 'running' | 'complete' | 'error' | 'budget_exceeded' | 'expired' | 'aborted';

export interface AgentRun {
  id: string;
  mode: AgentRunMode;
  actorId: string | null;
  agentName?: string;
  status: AgentRunStatus;
  model: string;
  inputTokens: number;
  outputTokens: number;
  startedAt: string;
  finishedAt: string | null;
  errorCode?: ErrorCode;
}

export type AgentToolOutcome =
  | 'executed'
  | 'approved'
  | 'rejected'
  | 'expired'
  | 'stale'
  | 'error'
  | 'blocked'
  | 'aborted';

export type AgentApprovalStatus = 'pending' | 'approved' | 'rejected' | 'expired' | 'stale';

export interface AgentApproval {
  status: AgentApprovalStatus;
  summary: string;
  expiresAt: string;
  decidedBy?: string;
  decidedAt?: string;
}

export interface AgentToolCall {
  id: string;
  runId: string;
  tool: string;
  args: unknown;
  outcome: AgentToolOutcome;
  result?: unknown;
  latencyMs: number;
  createdAt: string;
  stagedVersion?: number;
  executedVersion?: number;
  preImage?: unknown;
  approval?: AgentApproval;
}

export interface AgentToolCallPublic extends AgentToolCall {
  result?: never;
}

export type TriageMode = 'suggest' | 'auto-apply';

export interface AgentConfig {
  name: string;
  enabled: boolean;
  mode: TriageMode;
  allowedFields: string[];
  dailyActionCap: number;
  flagThreshold: WorkOrderPriority;
  workingHours: string;
  updatedBy: string | null;
  updatedAt: string;
}

export interface TriageSuggestion {
  id: string;
  workOrderId: string;
  runId: string;
  summary: string;
  suggestedPriority: WorkOrderPriority;
  flagForDispatcher: boolean;
  applied: boolean;
  createdAt: string;
}
