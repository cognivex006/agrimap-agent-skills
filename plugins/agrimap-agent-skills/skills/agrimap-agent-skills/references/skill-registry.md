# Skill registry — ชื่ออ้างอิงมาตรฐานของทุก knowledge module

ทะเบียนรหัสสั้นสำหรับอ้างถึง skill/knowledge ใน receipt, handoff, และ log (`skillsUsed`)
เพื่อให้คนอ่าน logs เห็นว่า "งานชิ้นนี้คิดแบบนี้ เพราะใช้สกิลนี้" — **เป็น observability
ไม่ใช่ gate**: การไม่ใส่ไม่ทำให้ event ผิด แต่การใส่ให้ใช้รหัสจากตารางนี้เท่านั้น ห้ามแต่งรหัสใหม่

## Core workflow

| ID | ไฟล์ | ใช้เมื่อ |
|---|---|---|
| `agm:router` | `SKILL.md` | เลือก dedicated operation skill เท่านั้น; ไม่ execute task |
| `agm:glossary` | `glossary.md` | นิยาม authority, work boundary, task size, QA, model identity |
| `agm:lifecycle-core` | `lifecycle-core.md` | compact `light|standard|regulated` contract และ milestone selector สำหรับ aliases |
| `agm:roles` | `roles.md` | เลือก/สวมบทบาท |
| `agm:qa-and-done` | `qa-and-done.md` | QA scope, sequence, completion gate |
| `agm:analysis-discipline` | `analysis-discipline.md` | แยก FACT/INFERENCE/HYPOTHESIS/UNKNOWN |
| `agm:elicitation` | `elicitation.md` | resolve parameter ที่ขาด |
| `agm:autonomy` | `autonomy.md` | ตัดสินเอง/ถาม/ยืนยัน และ Decision Card |
| `agm:git-workflow` | `git-workflow.md` | work branch, delivery, integration และคำตอบสั้น |
| `agm:spec-driven` | `spec-driven.md` | development mode และตำแหน่ง spec |
| `agm:input-and-scope` | `input-and-scope.md` | normalize inputs/attachments |
| `agm:goal-rules` | `goal-rules.md` | mandatory Think/Simplicity/Surgical/Goal-Driven discipline |
| `agm:passive-map` | `assets/passive-skill-map.json` | canonical routing for embedded supporting capabilities and their non-authorizing effects |
| `agm:passive-capabilities` | `passive-capabilities.md` | embedded design/test/refactor/SQL supporting disciplines |
| `agm:refactor-modes` | `refactor-modes.md` | เลือกโหมด refactor |
| `agm:memory-and-logs` | `memory-and-logs.md` | schema ของ memory/log |
| `agm:subagents` | `subagents-and-branches.md` | delegation / workspace mode |
| `agm:prompt` | `prompt.md` | สร้าง immutable versioned Prompt Result |
| `agm:url-matrix` | `application-url-matrix.md` | exact FE/BE application and callback URL decisions |
| `agm:service-matrix` | `service-url-matrix.md` | service/job gateway keys, Kubernetes Services, namespaces, health; no DB or IP data |
| `agm:service-ownership` | `service-ownership.md` | งานข้าม service/ownership |
| `agm:platform-syntax` | `platform-syntax.md` | provider detection / invocation syntax |
| `agm:skill-routing` | `skill-routing.md` (จาก `assets/skill-routing.json`) | เลือก skill เดียวจาก intent × lane และ supporting package |
| `agm:sql-context` | `sql-context-readonly.md` | sql-context-pack แบบอ่านอย่างเดียวใน agm-* และขอบเขต owner turn |
| `agm:skill-registry` | `skill-registry.md` | ทะเบียนนี้เอง |

## Engineering disciplines

| ID | ไฟล์ | ใช้เมื่อ |
|---|---|---|
| `agm:fe-engineer` | `frontend-engineer.md` | ทุกงาน FE (detection, reuse, phase gates, structure-over-logic) |
| `agm:be-engineer` | `backend-engineer.md` | ทุกงาน BE (profile detection, host profiles, phase gates) |

## Patterns (routers + shared)

| ID | ไฟล์ | ใช้เมื่อ |
|---|---|---|
| `agm:patterns/frontend` | `patterns/frontend.md` | router งาน FE ทุกชนิด |
| `agm:patterns/backend` | `patterns/backend.md` | router งาน BE ทุกชนิด |
| `agm:patterns/csharp` | `patterns/csharp.md` | baseline และตัวอย่างทุกงาน C# ฝั่ง BE |
| `agm:patterns/sql` | `patterns/sql.md` | router งาน SQL + DDL Standard + message gate |
| `agm:patterns/gencode-api` | `patterns/gencode-api.md` | งาน generated API ทุก workspace |
| `agm:patterns/conflict-resolution` | `patterns/conflict-resolution.md` | เมื่อใช้ golden evidence |
| `agm:patterns/status` | `patterns/pattern-status.md` | pattern ขาด/ยังไม่ verify |
| `agm:patterns/checklists` | `patterns/checklists/README.md` | นิยาม MUST/SHOULD/FREE และสารบัญ checklist |
| `agm:patterns/owner-intake` | `patterns/owner-example-intake.md` | ขอ example ใหม่จาก owner |

## Golden collections

| ID | โฟลเดอร์ | ใช้เมื่อ |
|---|---|---|
| `agm:golden/frontend-main` | `patterns/golden/frontend-main/` | งานแอปหลัก `agmwa-platform-ng` |
| `agm:golden/frontend-libraries` | `patterns/golden/frontend-libraries/` | งาน `@agrimap/*` library workspace |
| `agm:golden/backend-main` | `patterns/golden/backend-main/` | งาน BE main (agmws + agmbo ใช้ร่วมกัน) |
| `agm:golden/backend-libraries` | `patterns/golden/backend-libraries/` | งาน `AgriMap.Platform` libraries |
| `agm:golden/backend-request-values` | `patterns/golden/backend-libraries/013-1-extensions-request-value-normalize.md` | งานอ่าน/normalize cookie, header, query, form, JSON body และ device ID ทั้ง BE main/library |
| `agm:golden/sql` | `patterns/golden/sql/` | หลักฐาน SQL |

## Golden checklists (MUST-tier extract)

| ID | ไฟล์ | ใช้เมื่อ |
|---|---|---|
| `agm:checklist/frontend-main` | `patterns/checklists/frontend-main.md` | ก่อนเขียน `fe-main` |
| `agm:checklist/frontend-libraries` | `patterns/checklists/frontend-libraries.md` | ก่อนเขียน `fe-library` |
| `agm:checklist/backend-main` | `patterns/checklists/backend-main.md` | ก่อนเขียน `be-main` (agmws + agmbo) |
| `agm:checklist/backend-libraries` | `patterns/checklists/backend-libraries.md` | ก่อนเขียน `be-library` |
| `agm:checklist/sql` | `patterns/checklists/sql.md` | ก่อนใช้ entry ใน `golden/sql/` |

## วิธีใช้ใน logs

ใส่ field `skillsUsed` ใน log event เป็น array ของรหัสข้างบน เรียงตามน้ำหนักที่มีผลต่อการคิด
ระบุเฉพาะตัวที่**มีผลจริง**ต่อ step นั้น ไม่ใช่ทุกตัวที่เปิดผ่าน:

```json
"skillsUsed": ["agm:patterns/sql", "agm:golden/sql", "agm:qa-and-done"]
```

อ้างอิงในข้อความ receipt/handoff ใช้รหัสเดียวกัน เช่น
`Patterns: agm:patterns/sql + agm:golden/sql (LUT_NOTI_CHANNEL.sql)`
