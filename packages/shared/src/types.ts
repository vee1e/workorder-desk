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
  | 'INTERNAL';

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

export const CURSOR_SECRET_MIN_LENGTH = 32;
