# Workflow — ทำงานเท่าที่โจทย์ต้องการ

[หน้าหลัก](../README.md) · [คำสั่ง](USAGE.md) · [Release](RELEASE.md)

## ไม่ใช่ทุกงานต้องมี workflow

ถามว่า “โค้ดนี้ทำอะไร” ให้ตอบจากหลักฐานได้เลย ไม่ต้อง identify, init, สร้าง task หรือรัน tests การเรียก skill ตรง ๆ ไม่ได้บังคับให้สร้างไฟล์ และอยู่ใน AgriMap repository ก็ไม่ได้ทำให้ทุกบทสนทนาเป็นงานโครงการ

| ลักษณะงาน | การบันทึกที่เหมาะสม |
| --- | --- |
| อธิบาย เปรียบเทียบ ขอ help หรือ review ที่ไม่ขอรายงานถาวร | ไม่มี execution/task; raw submit ที่เกี่ยวข้องอาจอยู่ใน prompt history |
| แก้งานขนาดจำกัดที่อนุมัติแล้ว | light: memory ปัจจุบัน/ล่าสุดและ milestone audit แบบสั้น ไม่มี tasks |
| ต้อง resume, handoff หรือผู้ใช้ขอติดตาม | standard: savepoint ใน memory/current |
| มี boundary ข้อมูล/ความปลอดภัย/public contract, external publication หรือ independent assurance จริง | regulated: savepoint เดียวพร้อมหลักฐานที่ความเสี่ยงนั้นต้องใช้ |

จำนวนไฟล์และอายุ model ไม่ใช้ตัดสิน depth งานเอกสารหลายหน้าก็ไม่จำเป็นต้อง regulated ส่วนการแก้ contract เพียงไฟล์เดียวอาจต้องใช้ assurance สูง

## ไฟล์แต่ละอย่างมีไว้ทำอะไร

| ที่เก็บใต้ .agrimap-agent | ใช้เมื่อ |
| --- | --- |
| prompts/YYYY-MM/conversation/history.md | เก็บ raw user submissions ที่เกี่ยวข้อง ไม่ปนคำตอบ AI; อยู่ในเครื่องเท่านั้น ไม่ขึ้น Git (5.0.1) |
| prompts/YYYY-MM/conversation/context-vNNN.md | มี Prompt Result ที่พร้อมใช้; immutable |
| memory/current | savepoint: เป้าหมาย, ทำแล้ว, ที่เหลือ, ขั้นถัดไป, การตัดสินใจ และ branch ของงานที่ยังไม่จบ |
| memory/recent | ผลและหลักฐานเมื่อจบ/เปลี่ยน milestone |
| memory/project.md | ความรู้ระยะยาวที่งานต่อไปนำกลับมาใช้ได้ |
| logs/YYYY-MM | attribution และเหตุการณ์ของ durable work |
| reports / เอกสาร QA หรือ analysis แยก | มีผู้อ่าน/ผู้รับผลลัพธ์ต้องการจริง ไม่สร้างเพียงเพื่อครบชุด |

เมื่องานจบ รายการที่ทำแล้วจะคัดลงใน memory/recent และลบ savepoint ส่วนงานที่ค้างหรือ blocked จะเก็บ savepoint ไว้ งานใหม่ไม่สร้าง tasks/ แล้ว ส่วน tasks/ เดิมและงาน 2.x ห้าไฟล์ยังอ่านและใช้ validator เดิม อย่าลบเพื่อให้เหมือนงานใหม่

สำหรับ repo ที่รับ bootstrap AGENTS ฉบับ owner-supplied ล่าสุด ให้ใช้ project-specific portable recording §9: report ทำเมื่อ owner ขอ และใช้ allowlist ตาม contract นั้น ตารางข้างต้นเป็นค่าเริ่มต้นของ package ไม่ใช้ลบข้อกำหนด project หรือเปิด lifecycle ซ้ำ ดู [Release](RELEASE.md)

## งานค้างและการทำต่อ (savepoint, 5.0.1)

งานที่ยังไม่จบมี savepoint ใน `.agrimap-agent/memory/current/` บอกว่าทำอะไรไปแล้ว เหลืออะไร และขั้นถัดไปคืออะไร Agent อัปเดตทุก milestone และก่อนพักงาน พอเปิด session ใหม่ บรรทัดแรกของ context จะแสดง `⏸ Pending work` ให้เห็นทันที

| พิมพ์ | ผล |
| --- | --- |
| `งานค้าง`, `มีงานค้างไหม`, `สรุปงานที่เหลือ` | แสดงรายการงานค้างพร้อมเลข: สิ่งที่ทำแล้ว, ที่เหลือ, ขั้นถัดไป, branch, อายุ |
| `ทำต่อ`, `resume`, `ทำต่อ 14093012` | ย้ายงานค้างมาที่ session นี้ สลับ branch ถ้าต้อง แล้วทำต่อจากขั้นถัดไป (มีหลายงานจะถามก่อนว่าจะทำงานไหน) |
| `savepoint`, `เซฟงานไว้`, `พักไว้` | บันทึกจุดที่งานอยู่ตอนนี้ก่อนพัก |

พิมพ์เรื่องอื่นแทรกระหว่างทำงาน: ถ้าเกี่ยวกับงานเดิม Agent รวมเข้าไปและอัปเดต savepoint ถ้าไม่เกี่ยว Agent ตอบเรื่องนั้นแล้วเตือนหนึ่งบรรทัดว่างานเดิมยังค้างอยู่ session ที่เพิ่งใช้งานใน 10 นาทีจะไม่ถูกย้ายงานไปโดยไม่ยืนยัน และ session ที่มีงานอื่นค้างอยู่จะไม่ถูกเขียนทับ

## Orchestration: Leader กับ subagent (5.0.1)

งานที่มีตั้งแต่ 2 ส่วนขึ้นไป Agent จะตัดสินทุกครั้งว่าทำขนานหรือทีละขั้น และบอกในบรรทัดเดียว (`Orchestration: sequential` หรือ `Orchestration: 3 agents — ...`) โดยไม่ถามจำนวน agent

- **แผน:** แตกงานเป็น work graph (lane, repo, ไฟล์, งานที่ต้องรอ, contract ที่สร้าง/ใช้) Leader กำหนด contract ร่วม (SP, DTO/API, input ของ component) ก่อน แล้วงานที่ไฟล์/repo ไม่ทับกันจึงขนานกัน
- **Leader:** จ่ายงาน ตรวจหลักฐาน และรวมงาน subagent เป็นคนเขียน มีได้สูงสุด 5 ตัว และ **เติมงานใหม่ทันที** เมื่อตัวใดเสร็จ ไม่รอให้ครบทุกตัว
- **Model ของ subagent** (เบาไปหนัก ตามความยากของงานย่อย): Claude `haiku` medium → `sonnet` low → `opus` low · Codex GPT-6 Luna low → GPT-5.6 Terra low → GPT-5.6 Luna medium · Antigravity Gemini 3.8 Flash · host ที่เลือก model ไม่ได้ใช้ค่าเริ่มต้น (แก้ได้ที่ `model-capability-matrix.yaml`)
- **Worktree เป็นของชั่วคราว:** subagent ที่เขียนพร้อมกันได้ worktree ของตัวเองข้าง repo (`<repo>.worktrees/<job-id>`) บน branch `feature/<slug>-<id>` จากงานที่รวมแล้วล่าสุดของ Leader งานเดี่ยวใช้ branch ปกติ ไม่สร้าง worktree
- **รวมแล้วลบ:** Leader ตรวจผ่านแล้วรวมเข้า branch ของ Leader บันทึกลง log แล้ว **ลบ worktree และ branch ชั่วคราวเอง** ถ้า test ไม่ผ่าน มีไฟล์ค้าง หรือ conflict จะไม่ลบอะไร การแก้รอบใหม่สร้าง job ใหม่ที่อ้าง job เดิม ไม่ใช้ worktree เก่าซ้ำ และ worktree ที่ host สร้างเองก็ต้องรวมแล้วลบเช่นกัน

## ทำงานบน work branch และส่งงาน (4.6.0)

- งานแรกที่แก้ repository: Agent อ่าน `AGENTS.md` ของ repo (และระดับบน) ก่อน แล้วถาม workflow ของทีม **ครั้งเดียว** บันทึกเป็น `.agrimap-agent/policy/workflow.json` (commit เข้า repo)
- เมื่อ policy ยืนยันแล้ว งานใหม่จะอยู่บน `feature/…` หรือ `hotfix/…` เท่านั้น (5.0.1: งานแก้ bug, refactor, docs, chore ใช้ `feature/…` ส่วน commit ยังใช้ `fix:`/`comment:` ตามชนิดงาน; guard G9 ปฏิเสธ `fix/…`, `chore/…`) และเมื่อจบงาน Agent จะ commit + push **เฉพาะ work branch** แล้วตรวจ SHA บน remote ไม่ push/merge `develop`, `main`, `jenkins*` เอง
- ไฟล์ที่ค้างอยู่ก่อนเริ่มงานจะไม่ถูกรวมใน commit; test ไม่ผ่านยังส่งขึ้น work branch ได้แต่จะมี `⚠️ ต้องตามต่อ` และไม่เสนอ merge
- `.agrimap-agent/policy/project.json` บอกว่า project เป็น Not AI-First (code-first), AI-First (spec-first) หรือ hybrid; path ของ spec นอก repo จำไว้เฉพาะเครื่องใน `.agrimap-agent/local/memory.md` ซึ่งไม่ถูก commit

## Spec sync อัตโนมัติ (4.7.0)

- AI-First (spec-first) หรือไฟล์ใน scope ของ hybrid: ก่อนเขียน Agent รัน `spec context` แล้วอ่านเฉพาะไฟล์ที่เกี่ยว (ไม่เกิน 8 ไฟล์); open question ที่ block งานจะถูกถามก่อน
- หลัง test ผ่าน Agent อัปเดต status ของ task, evidence ใน traceability, changelog และ manifest ของ spec เอง **โดยผู้ใช้ไม่ต้องสั่ง** (`spec sync plan|apply`) แล้วรวมอยู่ใน commit เดียวกับ code; ส่วนที่เป็นเนื้อหา (requirement/AC/design) แก้ตามคำสั่งเท่านั้น ที่เหลือถามด้วย card
- อัปเดต spec ไม่ได้ (เช่น TASKS.yaml อ่านไม่ได้) ไม่ทำให้ส่งงานไม่ได้: งานยัง commit/push และ summary มี `⚠️ ต้องตามต่อ` พร้อม code และวิธีแก้; ทีมที่ต้องการบังคับตั้ง `specs.enforcement: "block"`
- spec pack ที่เป็น Git repo แยก: ได้สอง commit (repo code และ repo spec); pack ที่ยังไม่อยู่ใน Git ถูกแก้ในเครื่องเท่านั้นและมี warning `SPEC_SOURCE_NOT_GIT` ทุกครั้งที่ส่งงาน
- Not AI-First (code-first): Agent ไม่แตะ spec เอง; ถ้าสั่ง "อัปเดต spec ด้วย" ครั้งเดียว Agent ทำให้และตั้งเป็นกติกาของทุกงานทันทีโดยไม่ถาม (แจ้งใน "ตัดสินใจแทนไว้")
- ปิดทั้งหมดต่อ project ด้วย `governance.specSync: false` ใน `.agrimap-agent/config.json`

## จำการตัดสินใจ (4.8.0)

- เรื่องที่ทีมเคยตัดสินแล้ว (decision ใน `.agrimap-agent/decisions/`) Agent ใช้ตามเดิมโดยไม่ถามซ้ำ และอ้าง decision นั้นในรายงาน
- เลือกค่าเดิมซ้ำสองครั้ง Agent ถามครั้งเดียวว่าจะตั้งเป็นค่าของทีมไหม; ตอบ "ไม่ต้อง" แล้วจะไม่ถามอีก
- พูดว่า "ถามก่อนเสมอเรื่อง convention" Agent จะไม่ตัดสินเรื่องประเภทนั้นเองแม้เคยเลือกตามคำแนะนำบ่อย
- งาน release/version/deploy: กติกาอยู่ใน `AGENTS.release.md` ของ repo (แยกจาก `AGENTS.md` เพื่อให้ core สั้นลง); Agent อ่านไฟล์นี้ทั้งไฟล์เมื่อเป็นงาน release
- ปิดการจำได้ด้วย `governance.decisionMemory: false`

## Identity ไม่ใช่ authority

ชื่อผู้สั่งใช้บอกว่าใครขอทำงาน ส่วนสิทธิ์แก้โค้ด/เผยแพร่มาจากโจทย์ปัจจุบันและขอบเขตที่อนุมัติ ไม่ใช่ชื่อ OS หรือ Git config

ค่าเริ่มต้น v3 เก็บการยืนยันในขอบเขต local user/workspace โดยไม่หมดอายุรายวัน แต่โครงการเก่าที่ตั้ง confirmationHours ไว้ยังคงค่าของตน ดู [Migration](MIGRATION-3.0.md) ห้ามยืม identity หรือ DB profile ของอีกห้องสนทนา

## Prompt version เกิดเมื่อไร

1. V0 คือข้อความผู้ใช้ ไม่มี Prompt Result file
2. เมื่อกลั่นคำสั่งพร้อมใช้ครั้งแรก สร้าง V1
3. แก้เนื้อหาตามการตัดสินใจใหม่ของผู้ใช้ จึงสร้าง V2+ พร้อมที่มาของการเปลี่ยน
4. อธิบาย เปรียบเทียบ เสนอทางเลือก รับทราบ อนุมัติ หรือเนื้อหาเดิมซ้ำ ไม่สร้าง version ใหม่

การอนุมัติผูกกับไฟล์/version/hash ที่แน่นอนในหลักฐาน ไม่แก้ไฟล์ immutable เดิม และไม่ให้ helper ตัดสิน authority แทนผู้ใช้

## QA ที่เพียงพอ

เอกสารตรวจเนื้อหา ลิงก์ โครงสร้าง และตัวอย่าง ส่วน implementation ตรวจ regression ที่กระทบและ consumer ของ contract ที่เปลี่ยน ไม่รันชุดใหญ่ซ้ำเพราะเปลี่ยน reviewer หรือครบจำนวนครั้ง

ใช้ evidence เดิมเมื่อ source, dependency, configuration, environment และ coverage ตรงกัน ถ้าต่างให้ตรวจเฉพาะช่องว่างที่เกิดใหม่ คำว่า simulation หรือ “น่าจะผ่าน” ไม่ใช่ผล test จริง

- passed: หลักฐานที่จำเป็นครบ
- failed: พบ defect
- blocked: ขาด prerequisite ที่ทำให้ตรวจต่อไม่ได้
- not-applicable: ไม่มี executable check ที่เกี่ยวข้อง พร้อมเหตุผล

Independent review ใช้เมื่อความเสี่ยงหรือคำขอต้องการ ไม่ใช่ทุก edit ต้องมี subagent โมเดลชื่อเดียวกันก็ยังต้องแยกผู้ลงมือกับผู้ตรวจหากอ้างว่า independent

## คำแนะนำและความไม่แน่นอนที่ต้องมองเห็น

Design เป็น passive capability ในทุก operation ที่เหลือ ไม่ต้องเรียกคำสั่ง design แยก: เมื่อหลักฐานเพียงพอ Agent ควรเสนอวิธีที่แนะนำพร้อมเหตุผลและ qualitative confidence หากข้อมูลไม่พอ ต้องบอกว่าตัดสินใจได้ไม่แน่นอน ขาดอะไร และส่งผลอย่างไร ไม่เดินต่อด้วย assumptions ที่ไม่เปิดเผย

เมื่อพอให้คำแนะนำชั่วคราวได้ ให้ระบุว่า provisional พร้อม assumptions, confidence และสิ่งที่จะทำให้เปลี่ยนคำแนะนำ แยก facts จาก inference/assumptions ไม่สร้างชื่อไฟล์ schema metrics หรือผล test ขึ้นเองเพื่อให้คำตอบครบ ใช้ prose สั้นที่เห็นได้ตามปกติ ไม่ต้องสร้างรายงานหรือหัวข้อว่างทุกครั้ง

คำแนะนำไม่ใช่การอนุมัติให้แก้โค้ดหรือ deploy; ความไม่แน่นอนที่กระทบ contract/data/security ต้องหยุดเฉพาะส่วนนั้นและบอกข้อมูลที่ต้องการ

## Passive skills

คือความรู้สนับสนุน operation ปัจจุบัน เช่น patterns, schema context, release rules ไม่ได้เปิด workflow ใหม่หรือขยายสิทธิ์ เพราะใช้ agm-be จึงไม่ต้องโหลด SQL context หากงานนั้นไม่เกี่ยวกับฐานข้อมูล

Agent อ่านเฉพาะ reference ที่เงื่อนไขตรง และใช้ golden/template ที่สัมพันธ์กับ target จริง ไม่อ่านคลังทั้งหมดหรือคัดลอกตัวอย่างที่คนละประเภทโครงการ

<a id="sql-context"></a>
## SQL context: อ่านได้ ไม่ mutate

ใช้ local schema/caller ก่อน เมื่อยังขาด ใช้ skill sql-context-pack ที่ติดตั้งและ profile ที่เชื่อมกับ conversation นี้ได้ ขอบเขตคือ metadata/index และ SELECT แบบจำกัดคอลัมน์/แถว มี masking; integration จำกัดไม่เกิน 500 แถว และควรขอน้อยกว่านั้นเมื่อพอ

ห้าม CREATE/ALTER/DROP/INSERT/UPDATE/DELETE/MERGE/TRUNCATE, SELECT INTO, EXEC/CALL, routine deployment หรือ metadata sync รวมถึงทางอ้อมที่เขียน DB ข้อห้ามนี้ไม่เปลี่ยนตาม model, depth หรือชื่อ owner

ถ้าไม่มี service/profile ให้แจ้งช่องว่าง ไม่สร้าง connection หรือขอ password เอง การเขียนไฟล์ .sql ตามคำสั่งผู้ใช้เป็นคนละเรื่องกับ execute บน DB

## Model profiles

- outcome: ให้เป้าหมาย constraints และ acceptance เปิดทางให้เลือก implementation
- guided: เพิ่ม checklist สั้นและตัวอย่างที่ตรงงาน เป็นค่าเริ่มต้นเมื่อยังไม่มีหลักฐานความสามารถ
- bounded: แบ่งหน่วยงานให้ชัด พร้อม input/output และข้อจำกัดที่ตรวจได้

เลือกจากผลที่สังเกตใน task family ไม่จัดอันดับด้วยยี่ห้อ รุ่น หรือจำนวน parameters ทุก profile ใช้ authority และ SQL boundary เดียวกัน
