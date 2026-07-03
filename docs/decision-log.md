# Decision log

One line per fundamental implementation choice, **at the moment it is made** — anything that realises an ADR, shapes the data model, or a future developer would ask "why is this like this?" about. Story-level details don't belong here. This log feeds the validation package for accredited customers.

| Date | Decision | Why | Relates to |
|---|---|---|---|
| *(example — replace)* | *Tenant isolation via shared DB + organisation_id + RLS* | *lowest ops load for a one-dev team; defence in depth with app-level scoping* | *ADR-1 / US-A2* |
