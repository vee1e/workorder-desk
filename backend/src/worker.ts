import mongoose from 'mongoose';
import { ensureTriageConfig, runTriage } from './agent/triage.js';
import { env } from './config/env.js';
import { logger } from './config/logger.js';
import { agentRepo } from './repositories/agent.repo.js';

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

async function main(): Promise<void> {
  await mongoose.connect(env.MONGODB_URI);
  await ensureTriageConfig();
  logger.info(
    { agent: 'triage', pollIntervalMs: env.AGENT_POLL_INTERVAL_MS, concurrency: env.AGENT_CONCURRENCY },
    'agent worker started',
  );

  let concurrency = 0;
  while (true) {
    if (!env.AI_ENABLED) {
      await sleep(env.AGENT_POLL_INTERVAL_MS);
      continue;
    }
    const config = await agentRepo.getAgentConfig('triage');
    if (!config || !config.enabled) {
      await sleep(env.AGENT_POLL_INTERVAL_MS);
      continue;
    }
    if (concurrency >= env.AGENT_CONCURRENCY) {
      await sleep(1000);
      continue;
    }
    const event = await agentRepo.claimOutboxEvent(new Date(), env.AGENT_LEASE_MS);
    if (!event) {
      await sleep(env.AGENT_POLL_INTERVAL_MS);
      continue;
    }
    concurrency += 1;
    void (async () => {
      try {
        const outcome = await runTriage(event.payloadRef);
        if (outcome === 'done' || outcome === 'skipped') {
          await agentRepo.completeOutbox(event._id.toString());
        } else if (event.attempts >= env.AGENT_MAX_ATTEMPTS) {
          await agentRepo.failOutbox(event._id.toString());
        }
      } catch (err) {
        logger.error({ err, eventId: event._id.toString() }, 'triage run failed');
        if (event.attempts >= env.AGENT_MAX_ATTEMPTS) {
          await agentRepo.failOutbox(event._id.toString());
        }
      } finally {
        concurrency -= 1;
      }
    })();
    await sleep(500);
  }
}

process.on('SIGTERM', () => {
  logger.info('agent worker shutting down');
  process.exit(0);
});

main().catch((err) => {
  logger.error({ err }, 'worker fatal');
  process.exit(1);
});
