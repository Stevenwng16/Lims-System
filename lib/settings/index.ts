import type { SettingsApi } from "./types";
import { mockSettingsApi } from "./mock";

// Swap point for the real backend adapter, same pattern as lib/auth.
export const settingsApi: SettingsApi = mockSettingsApi;

export type * from "./types";
export { hasSeqToken, previewIds, renderTemplate } from "./format-id";
