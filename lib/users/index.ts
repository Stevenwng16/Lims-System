import type { UserApi } from "./types";
import { mockUserApi } from "./mock";

// Swap point for the real backend adapter, same pattern as lib/auth.
export const userApi: UserApi = mockUserApi;

export type * from "./types";
