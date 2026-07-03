import type { PlatformApi } from "./types";
import { mockPlatformApi } from "./mock";

// Swap point for the real backend adapter, same pattern as lib/auth.
export const platformApi: PlatformApi = mockPlatformApi;

export type * from "./types";
