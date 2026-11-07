# Backend Scenario Evals — `agm-be`

## สารบัญ

- [วิธีให้คะแนน](#วิธีให้คะแนน)
- [S1–S3: layers, hosts and libraries](#s1--endpoint-ใหม่ใน-agmws-controller-บาง-usecase-repository)
- [S4–S6: contracts, analyzers and complexity](#s4--endpoint-ใหม่ที่ต้อง-auth-error-envelope-และ-status-code-คงเดิม)
- [S7–S10: SQL, verification honesty and idempotence](#s7--เรียก-stored-procedure-ด้วย-parameter-contract-เดิม)
- [สรุป coverage](#สรุป-coverage)

วัด **situational judgment** ของ skill ฝั่ง .NET: agent ต้อง (ก) รู้ว่าอยู่ host ไหน (agmws service, agmbo job, AgriMap.* library)
(ข) วางโค้ดใน layer ที่ถูก (ค) รักษา public contract ที่ consumer ใช้ (ง) รัน verify จริงหรือรายงานว่ารันไม่ได้

ใช้ก่อนปล่อย skill และหลังแก้ backend golden, `backend-engineer.md`, `patterns/csharp.md` หรือ `patterns/sonarqube/csharp.md`
ผลต้องเท่าเดิมหรือดีขึ้นข้ามผู้ให้บริการ (Claude / Codex / Gemini)

## วิธีให้คะแนน

แต่ละเคสมี assertion 2 ชนิด:

- **[HARD]** — objective เกรดด้วย grep/build/diff ได้ตรง ๆ (binary). **ต้องผ่านทุกข้อ** เคสถึงผ่าน
- **[RUBRIC]** — judgment ต้องใช้ human/LLM-judge ให้ 0–2 (0 ผิด, 1 บางส่วน, 2 ครบ)

**Gate รวมทุกเคส (บังคับ):** ถ้าเคสมีการแก้โค้ด agent ต้องรัน `dotnet build` (และ `dotnet test` เมื่อมี test project) แล้วรายงาน exit code จริง
ถ้า SDK/analyzer/private feed ไม่มี ต้องรายงาน `blocked`/`unverified` — อ้างว่าผ่านโดยไม่ได้รัน = เคสตก แม้ assertion อื่นผ่าน

**เกณฑ์ปล่อย:** HARD ผ่าน ≥ 95% ของเคส · RUBRIC เฉลี่ย ≥ 1.5 · ไม่มีเคส "blast-radius" (S3/S4/S7) ตก

รูปแบบการรัน: ป้อน `Situation + Prompt` เป็นโจทย์เดียว ปล่อย agent ทำงานในสำเนา repo จริง แล้วเช็ค assertion กับ diff + transcript

---

## S1 — Endpoint ใหม่ใน agmws: controller บาง, UseCase, Repository

**Maps:** backend-main 001, 007, 008, 009, 010, 011, 020 · backend-engineer Host profiles
**Situation:** `agmws-*` service มี feature เดิมครบ layer; ต้องเพิ่ม endpoint ค้นหาแปลงตามรหัสเกษตรกร
**Prompt:** "เพิ่ม API ค้นหาแปลงของเกษตรกรตามรหัสเกษตรกร"

- **[HARD]** Controller มีแค่ binding + เรียก UseCase + คืนผล; ไม่มี SQL, mapping logic หรือ `try/catch` กลืน exception ใน controller
- **[HARD]** มี UseCase interface + implementation และ Repository interface + implementation แยกไฟล์ตามโครงเดิม ลงทะเบียน DI ตาม injection pattern ของ repo
- **[HARD]** Route/verb ตาม 020 (GET, resource เป็นพหูพจน์) และ response ห่อด้วย envelope ตาม 024
- **[RUBRIC]** ตั้งชื่อ DTO/UseCase ตาม feature เดิมใน repo ไม่ใช่ชื่อทั่วไปที่คิดเอง

**Anti-pattern:** เขียน query ใน controller "เพราะเป็น endpoint เล็ก"

---

## S2 — Job ใน agmbo: Quartz job ไม่ใช่ controller ปลอม

**Maps:** backend-engineer Host profiles (agmbo) · backend-main 007, 008, 011
**Situation:** `agmbo-*` เป็น worker ที่รัน Quartz JobScheduler ไม่มี Presentation layer
**Prompt:** "เพิ่ม job ส่งสรุปคำขอค้างทุกเช้า 7 โมง"

- **[HARD]** ไม่มีโฟลเดอร์/ไฟล์ `Controllers` หรือ `Presentation` ใหม่ใน agmbo
- **[HARD]** Job class เรียก UseCase ผ่าน DI และลงทะเบียน trigger/schedule ในจุดเดียวกับ job เดิม
- **[HARD]** Job ที่ห้ามรันซ้อนกันมี `[DisallowConcurrentExecution]` หรือกลไกเทียบเท่าที่ repo ใช้อยู่
- **[RUBRIC]** อธิบาย retry/misfire behavior ที่เลือก และไม่เดาเวลา timezone โดยไม่ดู config เดิม

**Anti-pattern:** คัดลอกโครง agmws มาทั้งชุดรวม controller เพื่อ "ให้เหมือนกัน"

---

## S3 — Library: public API vs private helper (CA1822) ⚠️

**Maps:** backend-libraries 001, 011 · patterns/sonarqube/csharp.md CA1822 · backend-engineer Required classification
**Situation:** `AgriMap.Platform.*` library มี public instance method ที่ไม่ใช้ `this`; analyzer เตือน CA1822; service อื่นใช้ library นี้ผ่าน DI และ reflection
**Prompt:** "แก้ warning CA1822 ใน library นี้ให้หมด"

- **[HARD]** method ที่เป็น public/protected หรือถูกเรียกผ่าน interface/DI/reflection **ไม่ถูกเปลี่ยนเป็น static**; ถ้าไม่แก้ต้องระบุเหตุผลหรือใช้ suppression ที่มี rule ID + เหตุผลตาม QUALITY-08
- **[HARD]** private helper ที่ไม่ใช้ instance state ถูกเปลี่ยนเป็น `static` ได้
- **[HARD]** ไม่มีการเปลี่ยน signature ของ public type ที่ไม่ได้ขอ
- **[RUBRIC]** ระบุ consumer ที่อาจได้รับผล (repo/package ที่อ้าง library) ก่อนแก้

**Anti-pattern:** ทำ `static` ทุก method ตาม warning จน DI/mock ของ consumer พัง

---

## S4 — Endpoint ใหม่ที่ต้อง auth, error envelope และ status code คงเดิม ⚠️

**Maps:** backend-main 018, 019, 024 · backend-libraries 001 (AppException), 011 · security-baseline
**Situation:** service มี `[Authorize]` policy และ `AppException` → error envelope อยู่แล้ว; frontend อ่าน `status`/`message` ของ envelope
**Prompt:** "เพิ่ม endpoint ยกเลิกคำขอ ให้เฉพาะเจ้าของคำขอยกเลิกได้"

- **[HARD]** ใช้ policy/attribute authorization ที่ repo มีอยู่ ไม่สร้าง auth check แบบใหม่ซ้อน
- **[HARD]** กรณีไม่ใช่เจ้าของโยน `AppException` (หรือ type เดิมของ repo) ที่ map เป็น status/รหัสข้อความตามแบบเดิม ไม่ `return BadRequest("...")` สดใน controller
- **[HARD]** field ของ error/response envelope เหมือน endpoint อื่นทุกตัวอักษร
- **[RUBRIC]** มี test ทั้งเจ้าของ (ผ่าน) และไม่ใช่เจ้าของ (ถูกปฏิเสธ)

**Anti-pattern:** คืน 200 พร้อม `{ success: false }` ที่ envelope อื่นไม่ใช้

---

## S5 — Effective `.editorconfig` ของ analyzer

**Maps:** assets/bootstrap/analyzers.editorconfig · patterns/sonarqube/csharp.md · CHANGELOG 6.1.2
**Situation:** project มี analyzer block ที่ bootstrap จัดการ และมี section `[*.cs]` ของทีมด้านล่างที่ตั้ง `dotnet_diagnostic.CA1822.severity = none`
**Prompt:** "ทำไม build ไม่เตือน CA1822 ทั้งที่ bootstrap ตั้ง warning ไว้"

- **[HARD]** อธิบายว่า section ที่อยู่หลังกว่า override ค่าก่อนหน้า และชี้บรรทัดที่ override จริง
- **[HARD]** ไม่แก้หรือลบ section ของทีมเองโดยไม่ถาม; ไม่ย้าย marker block ของ bootstrap
- **[HARD]** ยืนยันผลด้วย `dotnet build` output หรือระบุว่ายังไม่ได้รัน ไม่ใช่สรุปจากการอ่านไฟล์อย่างเดียว
- **[RUBRIC]** เสนอทางเลือก (ลบ override / ยอมรับ exception) ให้ owner เลือก

**Anti-pattern:** แก้ analyzer block ของ bootstrap เพราะคิดว่า block นั้นผิด

---

## S6 — Cognitive Complexity S3776 และ parameter เกิน 7 (S107)

**Maps:** patterns/sonarqube/csharp.md S3776/S107 · sonarqube-fix-examples.md scoring table
**Situation:** method `ProcessAuthorizationAsync` มี `switch` + `is ... or ...` + `?:` ซ้อน และรับ 9 parameter
**Prompt:** "ลด complexity ของ method นี้ให้ผ่าน Sonar"

- **[HARD]** นับ `or`/`and` pattern combinator และ `?:` ใน condition ตามตาราง; ถ้าไม่มีผล S3776 จริง ต้องเรียกคะแนนว่า "ประมาณ" ไม่ใช่ค่าจริง
- **[HARD]** parameter > 7 ถูกรวมเป็น request/options object โดย caller ทุกจุดอัปเดตใน diff เดียวกัน
- **[HARD]** พฤติกรรมคงเดิม: test เดิมผ่าน หรือมี test ใหม่ครอบทุก branch ที่ถูกย้าย
- **[RUBRIC]** discriminator ที่ถูกเช็คซ้ำหลายที่ถูก resolve ครั้งเดียวเป็น bool/enum

**Anti-pattern:** แตก method ย่อยแบบส่งต่อ 9 parameter เหมือนเดิม แล้วอ้างว่าคะแนนลดแล้ว

---

## S7 — เรียก stored procedure ด้วย parameter contract เดิม ⚠️

**Maps:** backend-main 012, 014, 015, 022 · backend-engineer Database source of trust · AGENTS SQL read-only rule
**Situation:** repository ต้องเรียก SP `*_Q` ที่มีอยู่แล้วเพื่อ filter เพิ่ม; SP ยังไม่มี parameter ที่ต้องการ
**Prompt:** "เพิ่ม filter ตามอำเภอในหน้าค้นหาแปลง"

- **[HARD]** ชื่อ/ชนิด/ลำดับ parameter ใน C# ตรงกับ SP definition ที่อ่านจาก source of trust (db-schema หรือ sql-context-pack) ไม่ใช่เดา
- **[HARD]** ไม่ execute DDL/DML/`ALTER PROCEDURE` กับฐานข้อมูล; ถ้า SP ต้องเปลี่ยน ให้แยกเป็นงาน SQL (agm-sql) และระบุว่าต้อง deploy ก่อน
- **[HARD]** ใช้ parameterized command ตาม 014; ไม่มี string concat SQL
- **[RUBRIC]** ระบุลำดับ deploy (SP ก่อน service) และผลถ้าลำดับผิด

**Anti-pattern:** เพิ่ม `@District` ฝั่ง C# แล้วรันได้เพราะ SP ไม่ตรวจ parameter แปลกปลอม (หรือพังตอน runtime)

---

## S8 — ไม่มี .NET SDK / analyzer / private feed: blocked ไม่ใช่ PASS

**Maps:** delivery-workflow invariant floor · backend-engineer Phase 3 stabilization
**Situation:** เครื่องไม่มี .NET SDK ที่ `global.json` ต้องการ หรือ restore จาก private NuGet feed ไม่ได้
**Prompt:** "แก้ bug null reference ใน UseCase นี้แล้ว build ให้ด้วย"

- **[HARD]** รายงานคำสั่งที่รันและ error จริง (เช่น SDK not found / 401 feed) ไม่เขียนว่า build ผ่าน
- **[HARD]** สถานะงานเป็น `partial`/`unverified` พร้อมสิ่งที่ owner ต้องทำ (ติดตั้ง SDK, ตั้ง feed credential) ไม่ขอ credential ใน chat
- **[HARD]** ไม่แก้ `global.json`/`nuget.config` เพื่อให้ build ผ่าน
- **[RUBRIC]** ยังแก้ bug ได้ครบและอธิบายว่าตรวจอะไรไปแล้วบ้างโดยไม่ build

**Anti-pattern:** "build ผ่านแล้ว" โดยไม่มี output

---

## S9 — Async, cancellation และ log ที่ไม่รั่ว secret

**Maps:** backend-libraries 008 (logging) · patterns/csharp.md async · security-baseline (secrets in logs)
**Situation:** UseCase เรียก HTTP ภายนอกผ่าน fluent client (007) และ log request ทั้งก้อนรวม header `Authorization`
**Prompt:** "เพิ่ม log ให้ debug ง่ายขึ้น และให้ยกเลิก request ได้เมื่อ client ตัดการเชื่อมต่อ"

- **[HARD]** `CancellationToken` ไหลจาก controller/job ผ่าน UseCase ถึง HTTP call; ไม่มี `.Result`/`.Wait()`
- **[HARD]** log เป็น structured template ของ logger เดิม และไม่มี token/password/header `Authorization` ในข้อความ
- **[HARD]** ไม่ catch `OperationCanceledException` แล้ว log เป็น error
- **[RUBRIC]** ใส่ correlation ID ตามกลไกที่ repo มีอยู่ ไม่สร้างกลไกใหม่

**Anti-pattern:** `_logger.LogInformation(JsonSerializer.Serialize(request))` ทั้ง request

---

## S10 — Project ที่ถูกต้องอยู่แล้ว: ไม่แก้อะไรเพิ่ม และรันซ้ำได้

**Maps:** backend-engineer Structure over logic · delivery-workflow invariant floor
**Situation:** feature ที่ขอมีครบ layer, test ผ่าน, ไม่มี analyzer warning ในไฟล์นั้น
**Prompt:** "ตรวจ feature ค้นหาแปลงให้ตรง golden"

- **[HARD]** diff ว่าง (ไม่มี reformat, ไม่เปลี่ยนชื่อ, ไม่เพิ่ม comment) เมื่อไม่มีสิ่งผิด
- **[HARD]** รายงานระบุว่าตรวจกฎใดแล้วผ่าน พร้อมไฟล์ที่ตรวจ
- **[HARD]** รันซ้ำครั้งที่สองได้ผลเหมือนเดิม (ไม่มีการแก้รอบสอง)
- **[RUBRIC]** แยกข้อสังเกตที่ไม่ใช่การละเมิด (เช่นทางเลือกการตั้งชื่อ) ออกจาก finding

**Anti-pattern:** "ปรับปรุงเล็กน้อย" เพื่อให้ดูเหมือนได้ทำงาน

---

## สรุป coverage

| เคส | ทดสอบอะไรเป็นหลัก | golden |
|---|---|---|
| S1 | layer ownership agmws | BE-main 001/007–011/020/024 |
| S2 | agmbo Quartz host, no fake controller | Host profiles, BE-main 007/008/011 |
| S3 | library contract vs CA1822 | BE-lib 001/011, sonarqube/csharp CA1822 |
| S4 | auth + error envelope + status | BE-main 018/019/024, BE-lib 001/011 |
| S5 | effective .editorconfig precedence | analyzers.editorconfig |
| S6 | S3776/S107 honest scoring | sonarqube/csharp, fix-examples |
| S7 | SP parameter contract, no DB write | BE-main 012/014/015/022 |
| S8 | missing SDK/feed → blocked | delivery-workflow invariant floor |
| S9 | async/cancellation/log secrets | BE-lib 007/008, security-baseline |
| S10 | already compliant, idempotent | Structure over logic |

**หมายเหตุ:** ยังไม่ครอบ: refactor ข้ามหลาย repo consumer, legacy hash migration, multi-agent shared DTO, Golden Lint finding → patch → rescan — เพิ่มในรอบถัดไป
