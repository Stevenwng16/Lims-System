import type { AuthApi } from "./types";
import { mockAuthApi } from "./mock";

// The single swap point: replace mockAuthApi with the real backend adapter
// once the partner API spec is known.
export const authApi: AuthApi = mockAuthApi;

export type * from "./types";
