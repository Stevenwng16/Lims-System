import type { LabApi } from "./types";
import { mockLabApi } from "./mock";

// Swap point for the real backend adapter, same pattern as lib/auth.
export const labApi: LabApi = mockLabApi;

export type * from "./types";
