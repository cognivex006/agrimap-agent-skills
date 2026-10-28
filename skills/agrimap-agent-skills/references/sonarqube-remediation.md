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
