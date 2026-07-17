// Clean-seed project: empty platform, vendor account only — must be set
// BEFORE any test file imports lib/mock-db (module-load time decision).
process.env.LIMS_CLEAN_SEED = "1";
