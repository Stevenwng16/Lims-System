# Working agreements

- **Acceptance criteria are the contract.** Never weaken, skip or reinterpret an AC to make code pass. AC wrong/impossible → stop and discuss with Ramazan (product owner / domain & compliance). Changing an AC = joint decision + changelog entry in the Notion master, then re-export.
- **Mechanisms are yours.** Anything not fixed by an AC or an invariant is a build-time choice — within the frames in `architecture-kaders.md`. Stories with real choices carry a **Developer decisions** block directly under the ACs; stories without one: just build.
- **The one non-negotiable:** every fundamental choice becomes one line in `decision-log.md` at the moment of choosing (what · why · date · relates to).
- **Frozen means:** the text only changes via a deliberate amendment + changelog line — never silently. Build reality will find things; that's what the amendment route is for.
- **Definition of Done is part of the story** — the named tests must exist and pass before a story is "done".
- Working language for everything dev-facing: **English**.
