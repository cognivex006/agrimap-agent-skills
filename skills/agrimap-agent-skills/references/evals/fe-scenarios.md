# Frontend Scenario Evals — `agm-fe`

## สารบัญ

- [วิธีให้คะแนน](#วิธีให้คะแนน)
- [S1–S3: app/library routing and synthesis](#s1--app-ใช้-input-ที่มาจาก-library-situate-app-lane)
- [S4–S6: generated API, refactor, and tests](#s4--ต้องการ-endpoint-ใหม่ในแอป-gen-code-ไม่ใช่เขียนมือ)
- [S7–S9: presentation, signals, and assets](#s7--presentational-component-อย่าเติม-facadestore-เกิน)
- [S10–S12: exceptions, versions, and templates](#s10--ไฟล์-legacy-ที่เป็น-tech-debt-exception-อย่า-แก้ให้ถูก)
- [S13: core-first for multi-screen work](#s13--หลายหน้าที่มีส่วนซ้ำ-สร้าง-shared-ก่อน-แล้วค่อยประกอบหน้า)
- [สรุป coverage](#สรุป-coverage)

วัด **situational judgment** ของ skill ไม่ใช่ความจำ: agent เจอสถานการณ์จริง แล้วต้อง (ก) รู้ว่า
ตัวเองอยู่พิกัดไหน (app vs library, consume vs modify) (ข) เลือกเลนถูก (ค) ทำตาม invariant
แม้ไม่มี pattern ตั้งต้น (ง) รัน verify loop จริง

ใช้ก่อนปล่อย skill และหลังแก้ golden/SKILL.md ทุกครั้ง — ควรได้ผลเท่าเดิมหรือดีขึ้นข้ามผู้ให้บริการ
(Claude / Codex / Gemini)

## วิธีให้คะแนน

แต่ละเคสมี assertion 2 ชนิด:

- **[HARD]** — objective เกรดด้วย grep/build/diff ได้ตรง ๆ (binary). **ต้องผ่านทุกข้อ** เคสถึงผ่าน
- **[RUBRIC]** — judgment ต้องใช้ human/LLM-judge ให้ 0–2 (0 ผิด, 1 บางส่วน, 2 ครบ)

**Gate รวมทุกเคส (บังคับ):** ถ้าเคสมีการแก้โค้ด agent ต้องรัน verify loop จริง
(`ng build` / `ng test` / เปิด playground demo ตามบริบท) และรายงานผล — ไม่รัน = เคสตก
แม้ assertion อื่นผ่าน

**เกณฑ์ปล่อย:** HARD ผ่าน ≥ 95% ของเคส · RUBRIC เฉลี่ย ≥ 1.5 · ไม่มีเคส "blast-radius" (S2/S5/S11) ตก

รูปแบบการรัน: ป้อน `Situation + Prompt` เป็นโจทย์เดียว ปล่อย agent ทำงานในสำเนา repo จริง
แล้วเช็ค assertion กับ diff + transcript

---

## S1 — App ใช้ input ที่มาจาก library (situate: app-lane)

**Maps:** frontend-libraries 003, 005, 009, 010 · SKILL "Analyze before editing"
**Situation:** ไฟล์ `apps/web/agmwa-platform-ng/.../create-dashboard/create-dashboard.component.html:43`
มี `<agrimap-form-ctrl [formConfig]="frmConfig" #frmCtrl />` โดย `form-ctrl` มาจาก `@agrimap/ui-kit`
**Prompt:** "ฟอร์มสร้าง dashboard ไม่ผูกค่าเริ่มต้นให้ ช่วยแก้ให้แสดง config ตั้งต้นถูกต้อง"

- **[HARD]** diff แตะเฉพาะไฟล์ใต้ `apps/web/agmwa-platform-ng/` — **ไม่มี** ไฟล์ใต้ `projects/ui-kit/` ถูกแก้
- **[HARD]** ไม่มีการเพิ่ม/แก้ `projects/ui-kit/src/public-api.ts`
- **[RUBRIC]** ระบุถูกว่า `formConfig` เป็น `model()` (two-way) และแก้ผ่าน `frmConfig`/`#frmCtrl.formGroup` ไม่ใช่ subscribe/สำเนา state
- **[RUBRIC]** อธิบายว่าปัญหาอยู่ฝั่ง consumer (แอป) ไม่ใช่ contract ของ ui-kit

**Anti-pattern:** เปิดไปแก้ `form-ctrl.ts` ใน library เพื่อ "ให้มันตั้งค่า default ให้"

---

## S2 — โจทย์เดียวกันแต่ต้องแก้ที่ library (blast-radius) ⚠️

**Maps:** frontend-libraries 003, 004, 011 · SKILL "Stop and discuss ... public contract"
**Situation:** เหมือน S1 แต่ requirement คือ "`form-ctrl` ต้องรองรับ field ชนิดใหม่ (`rating`) ที่ยังไม่มีใน `CtrlType`"
**Prompt:** "เพิ่มชนิด field 'rating' ให้ form-ctrl ใช้ในหน้า dashboard"

- **[HARD]** งานถูกจัดเป็น **library change** — มี diff ใต้ `projects/ui-kit/`
- **[HARD]** `projects/ui-kit/package.json` version ถูก bump (patch: `0.0.N → 0.0.N+1`)
- **[HARD]** มี demo/หรือ spec ที่ครอบ `rating` เพิ่มใน `projects/playground/` หรือ ui-kit spec
- **[RUBRIC]** ระบุ blast radius: public-api ของ ui-kit + consumer ทุกตัว + ต้อง republish + bump ที่แอปหลัก
- **[RUBRIC]** หยุดถาม owner ก่อน เพราะเปลี่ยน public contract (ไม่ใช่ reversible-in-scope)

**Anti-pattern:** ไปเพิ่ม logic 'rating' ในไฟล์แอป, หรือแก้ library เงียบ ๆ โดยไม่ bump/ไม่แจ้ง blast radius

---

## S3 — สร้าง component ใหม่ใน library โดยไม่มี golden เจาะจง (synthesize)

**Maps:** frontend-libraries 003, 005, 009, 011, 012
**Situation:** ต้องมี form control ใหม่ `star-rating` ใน `projects/ui-kit/src/lib/forms/star-rating/` — ไม่มีตัวอย่างเป๊ะ
**Prompt:** "สร้าง agrimap star-rating input control ใน ui-kit"

- **[HARD]** class ชื่อ **ไม่มี suffix `Component`** (เช่น `StarRating`), ไฟล์ `star-rating.ts` (no `.component`)
- **[HARD]** `@Component` selector ขึ้นต้น `agrimap-`
- **[HARD]** ถูก export ผ่าน `public-api.ts` (`grep star-rating public-api.ts`)
- **[HARD]** มีไฟล์ `star-rating.spec.ts` ใช้ `TestBed` + `await fixture.whenStable()` (library style ไม่ใช่ `detectChanges`)
- **[HARD]** มี demo ใน `projects/playground/`
- **[RUBRIC]** ใช้ ControlContainer + `controlName` input (หรือ CVA) ตาม pattern ui-kit — ไม่ประดิษฐ์ท่าใหม่
- **[RUBRIC]** signal `input()`/`output()` ตั้งชื่อสมเหตุ (ไม่ prefix `on` ที่ output)

**Anti-pattern:** ตั้งชื่อ `StarRatingComponent`/`star-rating.component.ts`, ลืม export, ใช้ `detectChanges` แบบแอป

---

## S4 — ต้องการ endpoint ใหม่ในแอป (gen-code ไม่ใช่เขียนมือ)

**Maps:** frontend-main 018 (§11) · T6
**Situation:** แอปต้องเรียก endpoint ใหม่ที่เพิ่งเพิ่มใน swagger ของ `agmws-data-management`
**Prompt:** "เพิ่มการเรียก API ดึงสถิติ dataset ใหม่ในหน้า data-warehouse"

- **[HARD]** **ไม่มี** API client / interface `*Dto` เขียนมือใหม่นอก `src/app/generated-apis/`
  (`grep -r "class Agmw\|interface .*Dto" src/app --exclude-dir=generated-apis` = ว่าง)
- **[HARD]** ถ้า regenerate: มีร่องรอยรัน `npm run gen-api:api` (คำสั่ง/คำอธิบายใน transcript) ไม่ใช่แก้ generated มือ
- **[RUBRIC]** facade แปลง DTO ด้วย `convertToCamel` + type จาก `*.model.ts` ก่อนเขียน store (T6)
- **[RUBRIC]** เปิดอ่านชื่อ method จริงใน `agmws-*-api.ts` ก่อนเรียก ไม่เดาชื่อ

**Anti-pattern:** เขียน `HttpClient.get()` ตรงใน facade/component, ประดิษฐ์ชื่อ method/DTO เอง

---

## S5 — Refactor ภายใน library โดยห้ามกระทบ contract ⚠️

**Maps:** frontend-libraries 003, 006, 011 · SKILL "Preserve existing logic"
**Situation:** `projects/dynamic-lut/src/lib/services/dynamic-lut.service.ts` มี logic ซ้ำ อยากจัดระเบียบภายใน
**Prompt:** "refactor dynamic-lut service ให้อ่านง่ายขึ้น"

- **[HARD]** `projects/dynamic-lut/src/public-api.ts` **ไม่เปลี่ยน** (diff ว่าง)
- **[HARD]** signature ของ `DynamicLutFacade.load()/load$()/queryLUT()` และ `providedIn: 'root'` คงเดิม
- **[HARD]** `ng build dynamic-lut --configuration production` ผ่าน
- **[RUBRIC]** พฤติกรรมเดิมคงอยู่ (store ยัง pure, async ยังอยู่ service) — ยืนยันด้วย playground/spec
- **[RUBRIC]** ไม่ bump major, ไม่แตะ consumer (เพราะ public API เท่าเดิม) — bump patch ถ้าจะ republish

**Anti-pattern:** rename public method "ให้สื่อความหมายกว่า", ย้าย async เข้า store, เปลี่ยน `providedIn`

---

## S6 — แตะ facade use case → ต้องมี test (mandatory)

**Maps:** frontend-main 019 (§12) · R2
**Situation:** เพิ่ม use case `deleteDataset$()` ใน facade ของ data-warehouse (ยิง generated API)
**Prompt:** "เพิ่มฟังก์ชันลบ dataset ใน data-warehouse facade"

- **[HARD]** มีไฟล์ `*.facade.spec.ts` สำหรับ facade ที่แก้ (ก่อนหน้านี้อาจ 0 ไฟล์ — ต้องสร้าง)
- **[HARD]** spec มี **ทั้ง** เคส success และ error (grep `throwError` + `of(` ในไฟล์)
- **[HARD]** spec mock ที่ระดับ generated API (`jasmine.createSpyObj`/`useValue`) ไม่ mock store
- **[HARD]** `ng test` ผ่าน
- **[RUBRIC]** ถ้าเพิ่ม store mutator ด้วย → มี store test (level 2) ครอบ mutator นั้น
- **[RUBRIC]** assert ค่าที่ facade คืน (`Observable<boolean>` → true/false) ถูกต้อง

**Anti-pattern:** ปิดงานโดยมีแค่ `should create`, mock ทุกอย่างจน test ไม่ทดสอบ logic

---

## S7 — Presentational component: อย่าเติม facade/store เกิน

**Maps:** frontend-libraries 006 · conflict-resolution FE-lib matrix
**Situation:** ต้องสร้าง badge component เล็ก ๆ ใน ui-kit ที่แค่รับ `label`/`color` แล้ว render
**Prompt:** "สร้าง agrimap-status-badge ใน ui-kit"

- **[HARD]** **ไม่มี** ไฟล์ `*.facade.ts` / `*.store.ts` ถูกสร้างสำหรับ badge
- **[HARD]** component รับผ่าน `input()` และไม่ inject API/facade
- **[RUBRIC]** ตัดสินถูกว่าเป็น presentational → ไม่ต้องมี layer (อ้าง "most libraries have no facade")

**Anti-pattern:** สร้าง `StatusBadgeFacade` + `StatusBadgeStore` เปล่า ๆ เพราะ "baseline บอกให้มี facade"

---

## S8 — Signal: computed ที่ต้อง toggle (เลือก primitive ถูก)

**Maps:** frontend-main 009 (§4 Signal Decision Guide)
**Situation:** ต้องมี `isPanelOpen` ที่ค่าเริ่มต้น derive จาก `items().length > 0` แต่ผู้ใช้กดปิด/เปิดเองได้
**Prompt:** "ทำ panel ที่เปิดเองเมื่อมีข้อมูล แต่ผู้ใช้ toggle ได้"

- **[HARD]** **ไม่มี** `computed(...)` ที่ถูกนำไป `.set()`/toggle (grep ไม่เจอ effect ที่ copy signal → set อีก signal)
- **[HARD]** ใช้ `linkedSignal(...)` (หรือ `signal` + init) สำหรับ `isPanelOpen`
- **[RUBRIC]** อธิบายว่าเลือก `linkedSignal` เพราะ derive-แต่-เขียนทับได้ (ไม่ใช่ effect-copy anti-pattern)

**Anti-pattern:** `computed` + shadow signal + `effect(() => _isOpen.set(...))`

---

## S9 — Asset path ใน SCSS (base-path ต่อ env)

**Maps:** frontend-main 017 (§10)
**Situation:** เพิ่มรูปพื้นหลังใน component scss ของแอป
**Prompt:** "ใส่ background image portal-bg.png ให้ hero section"

- **[HARD]** SCSS ใช้ `url(#{$base-path}/images/...)` — `grep "url(['\"]?/images"` ในไฟล์ที่แก้ = ว่าง
- **[HARD]** มี `@use '@styles/variables.scss' as *;` ในไฟล์ scss ที่อ้าง `$base-path`
- **[RUBRIC]** ถ้าเป็น `<img>` ใน HTML ใช้ relative `images/...` (ไม่มี `/` นำ, ไม่มี `assets/`)

**Anti-pattern:** `background: url('/images/portal/portal-bg.png')` (พังบน env ที่มี subpath)

---

## S10 — ไฟล์ legacy ที่เป็น tech-debt exception (อย่า "แก้ให้ถูก")

**Maps:** CODING-STANDARD §2 Exceptions · SKILL "Do not silently expand scope"
**Situation:** งานคือแก้ bug เล็กในหน้า map-viewer แต่ `map-viewer.component.ts` อยู่ในตาราง exception
(R1 Store, legacy pending refactor)
**Prompt:** "แก้ bug ที่ map-viewer แสดง layer group ผิดลำดับ"

- **[HARD]** diff จำกัดที่ bug จริง — **ไม่มี** การรื้อ `inject(...Store)` เป็น facade ในงานนี้
- **[RUBRIC]** ถ้าเห็น violation รู้ว่ามันคือ registered exception → บันทึกเป็น follow-on แยก ไม่แก้ในงานนี้
- **[RUBRIC]** ไม่ปิดงานโดยอ้างว่า "เผลอ refactor ให้ตามมาตรฐานแล้ว"

**Anti-pattern:** ถือโอกาส refactor map-viewer ทั้งไฟล์ให้เข้ามาตรฐาน R1 ระหว่างแก้ bug เล็ก

---

## S11 — Bump ui-kit ที่ auth-client pin exact ⚠️

**Maps:** frontend-libraries 002, 004
**Situation:** แก้ + publish `@agrimap/ui-kit` (จาก `0.0.80 → 0.0.81`) โดย `auth-client/package.json`
pin `@agrimap/ui-kit: "0.0.75"` แบบ exact
**Prompt:** "publish ui-kit เวอร์ชันใหม่ที่แก้ bug select"

- **[HARD]** ระบุ/แก้ exact pin ใน `projects/auth-client/package.json` (หรือแจ้งชัดว่าต้องแก้ก่อน publish)
- **[HARD]** bump version ui-kit เป็น patch (`0.0.81`) ไม่กระโดด minor/major
- **[RUBRIC]** grep หา consumer ที่ pin ก่อน publish (ทั้ง `projects/*` และแอปหลัก) — ไม่ publish แบบตาบอด
- **[RUBRIC]** ระบุลำดับ: bump → fix exact pin → publish → bump ที่แอปหลัก → verify playground

**Anti-pattern:** publish ui-kit ใหม่โดยไม่แตะ auth-client → consumer ได้ ui-kit สองเวอร์ชัน/ resolve fail

---

## S12 — Template control flow (built-in ไม่ใช่ *ngIf)

**Maps:** frontend-main 012 (§7)
**Situation:** เขียน template ใหม่วน list + เงื่อนไข loading/error
**Prompt:** "ทำ template แสดงรายการ dataset พร้อมสถานะ loading/error/empty"

- **[HARD]** ใช้ `@if/@else if/@for/@empty` — `grep "\*ngIf\|\*ngFor\|\*ngSwitch"` ในไฟล์ที่แก้ = ว่าง
- **[HARD]** `@for` มี `track` ด้วย unique id (ไม่ `track item` กับ object ที่สร้างใหม่)
- **[HARD]** อ่าน signal ใน template เรียก `()` (ไม่มี async pipe)
- **[RUBRIC]** ลำดับ loading → error → data ตาม pattern มาตรฐาน, ซ้อนไม่เกิน 3 ชั้น

**Anti-pattern:** ใช้ `*ngFor="let x of items"` / `track item` / ลืม `()` ตอนอ่าน signal

---

## S13 — หลายหน้าที่มีส่วนซ้ำ: สร้าง shared ก่อน แล้วค่อยประกอบหน้า

**Maps:** frontend-engineer Core-first for multi-screen work (5.0.1)
**Situation:** แอปยังไม่มี data table กลาง; ต้องสร้าง 3 หน้ารายการที่หน้าตาเหมือนกัน
**Prompt:** "สร้างหน้ารายการเกษตรกร รายการแปลง และรายการคำขอ แต่ละหน้ามี filter ตาราง แบ่งหน้า และ badge สถานะ"

- **[HARD]** มี component กลางใต้ `shared/` สำหรับตาราง+filter+paging และ status badge และถูกสร้างก่อนไฟล์ของหน้า (ลำดับใน plan/commit)
- **[HARD]** ทั้ง 3 หน้า import component กลางเดียวกัน; ไม่มี markup ตาราง/paging ซ้ำในแต่ละ feature
- **[HARD]** component กลางมี input/output ชุดเดียวที่ทั้ง 3 หน้าใช้ ไม่มี boolean option สำหรับหน้าที่ไม่ได้ขอ
- **[RUBRIC]** ตอบคำสั่งต่อ "เพิ่มปุ่ม export ทุกหน้า" ด้วยการแก้ component กลางครั้งเดียว

**Anti-pattern:** เขียนหน้า 1 ให้เสร็จแล้ว copy ไปหน้า 2 และ 3 ทำให้ต้องแก้ 3 จุดทุกครั้งที่เปลี่ยน

---

## สรุป coverage

| เคส | ทดสอบอะไรเป็นหลัก | golden |
|---|---|---|
| S1 | situate app-lane, consume library input | FE-lib 003/009/010 |
| S2 | blast-radius, library change, bump | FE-lib 003/004 |
| S3 | synthesize component ใหม่จาก invariant | FE-lib 005/009/011/012 |
| S4 | gen-code แทนเขียน API มือ | FE-main 018 |
| S5 | refactor ภายในไม่แตะ contract | FE-lib 003/006 |
| S6 | mandatory facade/store test | FE-main 019 |
| S7 | ไม่เติม layer เกิน (presentational) | FE-lib 006 |
| S8 | เลือก signal primitive ถูก | FE-main 009 |
| S9 | asset base-path ต่อ env | FE-main 017 |
| S10 | เคารพ legacy exception, ไม่ขยาย scope | CODING-STANDARD §2 |
| S11 | exact-pin dependency trap | FE-lib 002/004 |
| S12 | built-in control flow | FE-main 012 |
| S13 | core-first: shared parts ก่อนหน้า | frontend-engineer Core-first |

**หมายเหตุ:** เคสที่เป็น "synthesize" (S3) วัด objective ได้แค่ **conformance ต่อ invariant** ไม่ใช่
"ดีไซน์ตรงเฉลย" — ตั้งใจ เพราะคำตอบที่ถูกมีหลายทาง สิ่งที่บังคับคือกรอบ ไม่ใช่รูปแบบตายตัว
