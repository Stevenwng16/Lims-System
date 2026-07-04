import type { BatchApi } from "./types";
import { mockBatchApi } from "./mock";

// Swap point for the real backend adapter, same pattern as lib/auth.
export const batchApi: BatchApi = mockBatchApi;

export type * from "./types";
// The derived per-(sample × method) progress model (US-D1 AC 4, decision
// 3 Jul 2026): status is computed from batch membership, never stored.
export { sampleMethodProgress, sampleStatus } from "./progress";
export { canComposeBatch } from "./mock";
