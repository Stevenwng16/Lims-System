import type { QcApi } from "./types";
import { mockQcApi } from "./mock";

// Swap point for the real backend adapter, same pattern as lib/auth.
export const qcApi: QcApi = mockQcApi;

export type * from "./types";
// qcMaterialsForMethod is the epic-D batch-relevance hook (AC 9).
export { qcMaterialsForMethod } from "./mock";
