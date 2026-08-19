import type { Role } from '@workorders/shared';

export type ActorKind = 'human' | 'system';

export interface Actor {
  id: string;
  role: Role;
  kind: ActorKind;
  capability?: 'triage';
}

export function systemActor(capability: 'triage'): Actor {
  return { id: 'system', role: 'user', kind: 'system', capability };
}

export function isSystemActor(actor: Actor): boolean {
  return actor.kind === 'system';
}