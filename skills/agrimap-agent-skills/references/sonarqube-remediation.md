# SonarQube remediation — mandatory requester notice

For SonarQube-driven code changes in any lane, notify the requester before editing, even when the edit preserves behavior. This is a communication rule, not a new approval gate.

## Before editing

- Identify the finding, affected files/methods and rule ID when known. Distinguish an actual scan finding from a suspected violation found by review; never invent scan evidence.
- Explain why the change is needed, the proposed before/after approach and expected behavior/contract impact. Name uncertainty and the verification that will resolve it.
- If this changes code previously reported complete, accepted or delivered, explicitly say that you are revisiting completed work for a SonarQube issue. Explain why it is being reopened, including a missed finding in your earlier work when applicable. Do not silently reclassify it as unfinished work or a new feature.

Example notice for previously completed work:

> กำลังกลับมาแก้งานที่แจ้งว่าเสร็จแล้วใน `<file>:<method>` เนื่องจาก `<finding/rule>` โดยจะเปลี่ยน `<before>` เป็น `<after>` คาดว่าจะรักษาพฤติกรรมและ contract เดิม และจะตรวจด้วย `<checks>`

Use the current authorization and [autonomy rules](autonomy.md). Continue authorized, behavior-preserving changes after notifying; do not ask for the same permission again. A new scope, logic or public-contract change follows the existing decision boundary. A scan finding alone grants no edit authority; read-only review/QA reports the proposed fix without editing.

## After editing

Summarize the actual change, its relationship to the previously completed work, behavior/contract impact, and verification performed. State whether SonarQube was rerun and the actual result; a local refactor or build does not establish that the SonarQube issue is resolved. Disclose remaining findings or missing scan evidence.

## Advisory code smells (QUALITY-05)

The team and company agreed that the smells below are advisory: fixing them is optional. They never block delivery and never lower QUALITY-01..03, bugs, vulnerabilities or security hotspots.

- **Recommend first.** Report each one as a recommendation (review comment, QA/lint report item or summary line) with rule ID, `file:line`, evidence, proposed fix and risk. Do not edit for them during unrelated work, and do not add TODO or source comments unless asked.
- **Edit only on request with enough evidence.** Fix when the requester explicitly asks for that finding or rule and the evidence proves the fix preserves behavior and contracts (scan result or verified code reading, plus the caveats below). Notify before and after editing as above. If evidence is missing, keep the recommendation and name what is missing.
- **New code.** Code you write avoids these smells when doing so costs no behavior or contract change.
- Rules not listed here follow their scan severity and the normal decision boundary.

| ID | Rule | Smell | Recommended fix | Check before fixing |
| --- | --- | --- | --- | --- |
| ADV-01 | S4136 | Overloads with the same name are not adjacent | Move all overloads together, simplest (fewest parameters) first, in classes and interfaces | Pure reordering: keep `#region`, partial-file and diff-noise trade-offs in mind |
| ADV-02 | CA1822, S2325 | Member uses no instance data | Mark it `static` | Not for interface implementations, overrides, `virtual`/public API or members found through reflection (for example tests using `BindingFlags.Instance`) |
| ADV-03 | S1905 | Redundant cast | Remove the cast; `x as T ?? new T()` on a value already typed `T` becomes `x ?? new T()` | Confirm the expression's declared type and nullability; casts that select an overload or unify ternary branch types, such as `(object)new { ... }`, are not redundant |
| ADV-04 | S3236 | Caller-info argument passed explicitly | `ArgumentNullException.ThrowIfNull(name)`; `CallerArgumentExpression` supplies the name | Removing a different literal changes `ParamName`/message; check tests or clients that assert it |
| ADV-05 | S1481 | Unused local variable | Remove it; keep a call with side effects as `_ = Call();` | Confirm no use through conditional compilation or later edits in scope |
| ADV-06 | xUnit2032 | `Assert.IsAssignableFrom<T>(x)` | `Assert.IsType<T>(x, exactMatch: false)` | Needs an xUnit version with the `exactMatch` overload; keep using the returned value |
| ADV-07 | CA1816 | `Dispose()` does not call `GC.SuppressFinalize` | Add `GC.SuppressFinalize(this);` at the end of `Dispose()`, or seal a class with no finalizer | With the full dispose pattern, call it in `Dispose()`, not `Dispose(bool)` |
