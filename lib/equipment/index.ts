import type { EquipmentApi } from "./types";
import { mockEquipmentApi } from "./mock";

// Swap point for the real backend adapter, same pattern as lib/auth.
export const equipmentApi: EquipmentApi = mockEquipmentApi;

export type * from "./types";
// equipmentForMethodStep + equipmentAvailability are the epic-D gating hooks
// (AC 10): a step requiring equipment cannot complete while it is Blocked.
export { equipmentAvailability, equipmentForMethodStep } from "./mock";
