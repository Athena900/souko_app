import { getTrialStatus, trialWriteDisabledMessage } from "@/src/lib/trial";

export class TrialWriteDisabledError extends Error {}

/** 永続化するAPIの直前に置く、試用期限のサーバー側ガード。 */
export function assertTrialWriteAllowed(now = new Date()): void {
  const status = getTrialStatus(now);
  const message = trialWriteDisabledMessage(status);
  if (message) throw new TrialWriteDisabledError(message);
}
