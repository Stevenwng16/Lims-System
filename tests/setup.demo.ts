// Demo-seed project: run against the full demo dataset (flag unset — vitest
// does not load .env.local, so unset is the true default here).
delete process.env.LIMS_CLEAN_SEED;
