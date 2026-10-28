# Autonomy: decide, ask or confirm

Load before the first requester question or product write. Scripts compute git mechanics; you decide meaning; requesters decide authority.

## Classify each consequential choice

- Owner. Agent-owned: internal implementation inside the authorized scope, FREE-tier choices, private names, helper reuse, test layout by convention, step order, branch slug, commit wording. Requester-owned: scope, observable behavior, shared/public contracts, data, security, new dependencies, cross-service ownership, base/target branch, integration, publication.
- Risk. R0 local and reversible; R1 reviewable, not a contract; R2 contract, behavior, data or scope; R3 outward or irreversible (push/merge protected branches, PR merge, remote delete, tags, destructive git).
- Confidence. High: explicit current instruction, approved precedent, confirmed workflow policy or AGENTS chain rule, or a golden MUST agreeing with three or more repository instances. Medium: one golden rule, convention or general practice without conflict. Low: conflicting or missing evidence. Surface conflicts, never resolve silently.

## Act

Owner decision 2026-10-14 (5.0.1): the Agent's record is trusted, so the default is to act. Judge an effect by how far it reaches and whether it can be undone, not by its kind: local files, a work branch and `develop`/Inhouse (`jenkins`) are reversible with a new commit or revert; Production, tags, remote deletion and data loss are not.

Agent-owned R0/R1: decide (investigate first when Low). Requester-owned:

| | High | Medium | Low |
| --- | --- | --- | --- |
| R0 | decide | decide | investigate, decide |
| R1 | decide, mention | decide, list under "decided for you" | investigate, decide, list under "decided for you" |
| R2 | decide, cite the source | reversible: decide, list with how to change it; otherwise blocking card for the affected slice | blocking card naming missing evidence |
| R3 | under the current command or confirmed policy, without asking again | confirm | confirm |

R2 is not reversible when it changes a contract another repository or team already consumes, deletes or migrates data, or cannot be undone with a revert. An owner command such as `release full` is the confirmation for every effect its contract lists; ask inside it only for an anomaly that contract names.

Investigate before asking: search the repository, `policy show`, `recall --topic <area/subject> --paths <files>`, the AGENTS chain. Never ask what they already answer.

## Ask well

- At most one blocking round before the first write, up to three independent questions. A later R2 question pauses only its slice.
- Create each question with `agm-workspace.mjs decide card --input <file>`; render with the host's structured-question tool when available, otherwise the returned Markdown. Option 1 is the recommendation.
- Every card states impact, what you checked, options with different effects, the recommendation with reason and confidence, and its default or that it blocks.
- Never ask for granted permission, between equivalent options, for an open-ended preference, or approval after acting.
- Record the answer with `decide record`; its `recordAs` prevents asking again.
- `decide card` may return `suppressed` (use the precedent; cite it via `--precedent`) or `autoDecided` (R0/R1 at high or medium confidence, or R2 with `"reversible": true`; report as decided for you). A kind the requester keeps overriding (calibration `ask`) or marked always-ask still produces the card. A `promotable` recall → `decide promote`. "Always ask about X" → `decide always-ask --kind X`; a requester correction → `decide correction`.

## Report

Start: plan/assumptions (1–3 lines). Report R2+; [notify before SonarQube edits](sonarqube-remediation.md). End: summary, ≤5 "decided for you" items/how to change them, next-step card.
