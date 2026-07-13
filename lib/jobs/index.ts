import type { JobApi } from "./types";
import { mockJobApi } from "./mock";

// Swap point for the real backend adapter, same pattern as lib/auth.
export const jobApi: JobApi = mockJobApi;

export type * from "./types";
export { peekJobNumber } from "./ids";
export { deriveJobStatus, involvedLabIds, isJobOverdue } from "./mock";
