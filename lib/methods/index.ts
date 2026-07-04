import type { MethodApi } from "./types";
import { mockMethodApi } from "./mock";

// Swap point for the real backend adapter, same pattern as lib/auth.
export const methodApi: MethodApi = mockMethodApi;

export type * from "./types";
