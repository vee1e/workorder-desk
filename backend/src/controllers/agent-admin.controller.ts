import type { NextFunction, Request, Response } from 'express';
import { z } from 'zod';
import { ensureTriageConfig, runTriage } from '../agent/triage.js';
import { toAgentConfigPublic } from '../models/agent-config.model.js';
import { toAgentRunPublic } from '../models/agent-run.model.js';
import { agentRepo } from '../repositories/agent.repo.js';
import { workOrderRepo } from '../repositories/work-order.repo.js';
import { notFound } from '../utils/http-error.js';
import { assertValidObjectId } from '../utils/object-id.js';
import { actorOf, paramOf } from '../utils/request.js';

export const configPatchSchema = z
  .object({
    mode: z.enum(['suggest', 'auto-apply']).optional(),
    dailyActionCap: z.number().int().positive().optional(),
    flagThreshold: z.enum(['low', 'medium', 'high']).optional(),
    workingHours: z.string().optional(),
  })
  .strict();

export const runSchema = z
  .object({
    workOrderId: z.string().optional(),
  })
  .strict()
  .optional();

export const runsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

type ConfigPatchInput = z.infer<typeof configPatchSchema>;
type RunInput = z.infer<typeof runSchema>;

export const agentAdminController = {
  async getConfig(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      let config = await agentRepo.getAgentConfig('triage');
      if (!config) {
        await ensureTriageConfig();
        config = await agentRepo.getAgentConfig('triage');
      }
      if (!config) throw new Error('Agent config missing after upsert');
      res.status(200).json({ success: true, data: toAgentConfigPublic(config) });
    } catch (err) {
      next(err);
    }
  },

  async updateConfig(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const actor = actorOf(req);
      const patch = req.body as ConfigPatchInput;
      const before = await agentRepo.getAgentConfig('triage');
      if (!before) throw new Error('Agent config missing');
      const after = await agentRepo.updateAgentConfig('triage', patch, actor.id);
      if (!after) throw new Error('Agent config missing');
      await agentRepo.appendConfigAudit({ agentName: 'triage', actorId: actor.id, action: 'config.update', before, after });
      res.status(200).json({ success: true, data: toAgentConfigPublic(after) });
    } catch (err) {
      next(err);
    }
  },

  async disable(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const actor = actorOf(req);
      const before = await agentRepo.getAgentConfig('triage');
      if (!before) throw new Error('Agent config missing');
      await agentRepo.setAgentEnabled(false, actor.id);
      await agentRepo.appendConfigAudit({
        agentName: 'triage',
        actorId: actor.id,
        action: 'config.disable',
        before,
        after: { enabled: false },
      });
      res.status(200).json({ success: true, data: { enabled: false } });
    } catch (err) {
      next(err);
    }
  },

  async manualRun(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const body = req.body as RunInput | undefined;
      let workOrderId = body?.workOrderId;
      if (!workOrderId) {
        const page = await workOrderRepo.listAll({ limit: 1 });
        const target = page.items[0];
        if (!target) throw notFound('No work orders to triage');
        workOrderId = target._id.toString();
      } else {
        assertValidObjectId(workOrderId);
      }
      const outcome = await runTriage(workOrderId);
      res.status(200).json({ success: true, data: { outcome } });
    } catch (err) {
      next(err);
    }
  },

  async listRuns(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const query = req.query as unknown as { page: number; limit: number };
      const data = await agentRepo.listAdminRuns(query.page, query.limit);
      res.status(200).json({
        success: true,
        data: {
          items: data.items.map((run) => toAgentRunPublic(run)),
          page: data.page,
          limit: data.limit,
          total: data.total,
        },
      });
    } catch (err) {
      next(err);
    }
  },

  async runDetail(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = paramOf(req, 'id');
      assertValidObjectId(id);
      const run = await agentRepo.findRunById(id);
      if (!run) throw notFound();
      const [messages, toolCalls] = await Promise.all([agentRepo.listMessages(id), agentRepo.listToolCallsForRun(id)]);
      res.status(200).json({ success: true, data: { run: toAgentRunPublic(run), messages, toolCalls } });
    } catch (err) {
      next(err);
    }
  },
};
