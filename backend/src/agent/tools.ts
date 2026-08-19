import { z } from 'zod';
import type { Role, WorkOrderPriority, WorkOrderStatus } from '@workorders/shared';
import {
  aiCreateWorkOrderSchema,
  aiDeleteWorkOrderSchema,
  aiListWorkOrdersSchema,
  aiUpdateWorkOrderSchema,
} from '@workorders/shared';
import { workOrderService } from '../services/work-order.service.js';
import { adminService } from '../services/admin.service.js';
import { profileService } from '../services/profile.service.js';
import type { Actor } from '../utils/actor.js';

export interface Tool {
  name: string;
  description: string;
  mode: 'read' | 'write';
  requiresApproval: boolean;
  roles: Role[];
  inputSchema: z.ZodType;
  handler: (actor: Actor, args: unknown) => Promise<unknown>;
}

type ListArgs = { status?: WorkOrderStatus; priority?: WorkOrderPriority; search?: string };

// For update_work_order / delete_work_order the runtime injects `version` into
// `args` before calling the handler (it is never sent by the model), so handlers
// read `(args as { version: number }).version`.
type VersionedArgs = { version: number };

export const copilotTools: Tool[] = [
  {
    name: 'list_my_work_orders',
    description:
      "List the caller's own work orders with their current `version`. Call this before updating or deleting so you have valid work-order ids and versions. Supports optional filters: status (pending|in_progress|done), priority (low|medium|high), search (title text).",
    mode: 'read',
    requiresApproval: false,
    roles: ['admin', 'user', 'viewer'],
    inputSchema: aiListWorkOrdersSchema,
    handler: async (actor, args) => {
      const q = args as ListArgs;
      const { items } = await workOrderService.list(actor, { limit: 10, status: q.status, priority: q.priority, search: q.search });
      return items;
    },
  },
  {
    name: 'search_my_work_orders',
    description:
      "Search the caller's own work orders by title text using the `search` argument (required). Returns work orders with their current `version` for later update/delete.",
    mode: 'read',
    requiresApproval: false,
    roles: ['admin', 'user', 'viewer'],
    inputSchema: aiListWorkOrdersSchema,
    handler: async (actor, args) => {
      const q = args as ListArgs;
      const { items } = await workOrderService.list(actor, { limit: 10, status: q.status, priority: q.priority, search: q.search });
      return items;
    },
  },
  {
    name: 'get_profile',
    description: 'Get the caller profile (name, email, role). Takes no arguments.',
    mode: 'read',
    requiresApproval: false,
    roles: ['admin', 'user', 'viewer'],
    inputSchema: z.object({}).strict(),
    handler: async (actor) => profileService.me(actor.id),
  },
  {
    name: 'admin_list_work_orders',
    description:
      'List all work orders across the organization. Admin only. Supports optional status, priority, and search filters. Returns work orders with their current `version`.',
    mode: 'read',
    requiresApproval: false,
    roles: ['admin'],
    inputSchema: aiListWorkOrdersSchema,
    handler: async (_actor, args) => {
      const q = args as ListArgs;
      const { items } = await adminService.listWorkOrders({ limit: 10, status: q.status, priority: q.priority, search: q.search });
      return items;
    },
  },
  {
    name: 'admin_list_users',
    description: 'List users in the organization. Admin only. Optional `search` filters by name or email.',
    mode: 'read',
    requiresApproval: false,
    roles: ['admin'],
    inputSchema: z.object({ search: z.string().trim().max(64).optional() }).strict(),
    handler: async (_actor, args) => {
      const q = args as { search?: string };
      const { items } = await adminService.listUsers({ page: 1, limit: 10, search: q.search });
      return items;
    },
  },
  {
    name: 'admin_metrics',
    description: 'Get organization-wide metrics (user and work-order counts, uptime). Admin only. Takes no arguments.',
    mode: 'read',
    requiresApproval: false,
    roles: ['admin'],
    inputSchema: z.object({}).strict(),
    handler: async () => adminService.metrics(),
  },
  {
    name: 'create_work_order',
    description:
      'Create a new work order owned by the caller. Staged for the caller approval before it runs. Fields: title (required), description (optional), priority (low|medium|high, default medium), status (pending|in_progress|done, default pending).',
    mode: 'write',
    requiresApproval: true,
    roles: ['admin', 'user'],
    inputSchema: aiCreateWorkOrderSchema,
    handler: async (actor, args) =>
      workOrderService.create(
        actor,
        args as { title: string; description?: string | null; priority: WorkOrderPriority; status: WorkOrderStatus },
      ),
  },
  {
    name: 'update_work_order',
    description:
      'Update an existing work order (title, description, priority, or status). The work-order id must come from a tool result in this conversation; the current `version` is injected automatically. Staged for the caller approval before it runs.',
    mode: 'write',
    requiresApproval: true,
    roles: ['admin', 'user'],
    inputSchema: aiUpdateWorkOrderSchema,
    handler: async (actor, args) => {
      const { version } = args as VersionedArgs;
      const { id, title, description, priority, status } = args as {
        id: string;
        title?: string;
        description?: string | null;
        priority?: WorkOrderPriority;
        status?: WorkOrderStatus;
      };
      return workOrderService.update(actor, id, { title, description, priority, status, version });
    },
  },
  {
    name: 'delete_work_order',
    description:
      'Delete (soft-delete) an existing work order. The work-order id must come from a tool result in this conversation; the current `version` is injected automatically. Staged for the caller approval before it runs.',
    mode: 'write',
    requiresApproval: true,
    roles: ['admin', 'user'],
    inputSchema: aiDeleteWorkOrderSchema,
    handler: async (actor, args) => {
      const { id, version } = args as { id: string } & VersionedArgs;
      await workOrderService.remove(actor, id, version);
      return { ok: true, id };
    },
  },
];

const toolMap = new Map(copilotTools.map((tool) => [tool.name, tool]));

export function toolByName(name: string): Tool | undefined {
  return toolMap.get(name);
}
