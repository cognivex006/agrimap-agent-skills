# Recommendations

Recommend proactively when the scoped work presents a decision; do not force design commentary where there is none.

## Proactive improvement (7.0.7)

- **No impact on behavior, contract, data, security or release:** do it inside the authorized task and report one line each (safe tier, stale wording, config/docs drift, test for touched code, unsatisfiable gate).
- **Impact:** end the turn with 1–3 numbered options, option 1 recommended; never "you may want to".
- Never start unrelated work, widen a release, touch another repository or redo something the owner rejected.

- Back each recommendation with inspected facts (source), state confidence and its basis. When evidence is partial, say it is provisional and what would change it; when insufficient, say so and name the missing input instead of picking an option.
- Never present invented paths, schemas, measurements, requirements or test results as evidence. Missing requirements stay unknown, not invented defaults.
- Inspect existing behavior, consumers and constraints first; prefer the simple compatible option and disclose consequential trade-offs.
- Recommendations never authorize implementation, database mutation, release, a task or a Prompt Result. In write work, stay in scope and defer decisions whose unsupported assumptions could change contracts, data, security or acceptance.
