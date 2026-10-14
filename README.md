# AgriMap Agent Skills 4.11.0

[รุ่นล่าสุด](https://github.com/orchex006/agrimap-agent-skills/releases/latest) · [Tags รุ่นก่อน](https://github.com/orchex006/agrimap-agent-skills/tags) · [เลือกเวอร์ชันและ source ย้อนหลัง](docs/VERSIONS.md)

ชุดคำสั่งสำหรับให้ Agent ช่วยงาน AgriMap ตั้งแต่วิเคราะห์ ออกแบบ แก้โค้ด ตรวจงาน จนถึงเตรียม release ใช้กับ Codex, Claude Code และ Antigravity CLI โดยเลือกคำสั่งตามงาน ไม่ต้องเดินครบทุก workflow

**เริ่มที่ [Getting Started](docs/GETTING-STARTED.md)** — ติดตั้งให้ตรง host แล้วทดลองคำสั่งอ่านอย่างเดียวก่อน

## เลือกอ่านตามสิ่งที่ต้องการ

| ต้องการ | ไปที่ |
| --- | --- |
| ติดตั้งและทดลองครั้งแรก | [Getting Started](docs/GETTING-STARTED.md) |
| เลือกคำสั่ง / ดูความต่างของ analyze, prompt, exec, QA | [คู่มือคำสั่ง](docs/USAGE.md) |
| คัดลอกโจทย์ไปใช้กับงานจริง | [ชุดคำสั่งสำหรับผู้เริ่มต้น](docs/COMMAND-COOKBOOK.md) |
| เข้าใจ task, memory, identity, QA และ SQL context | [Workflow](docs/WORKFLOWS.md) |
| เตรียมโครงการ / ส่ง Inhouse / ส่ง Production | [Bootstrap และ Release](docs/RELEASE.md) |
| คำสั่งไม่ขึ้น / ยังเจอพฤติกรรมรุ่นเก่า | [Troubleshooting](docs/TROUBLESHOOTING.md) |
| เคยใช้ 2.x | [Migration 3.0](docs/MIGRATION-3.0.md) |
| แก้ไขหรือแจกจ่าย skill package นี้ | [คู่มือผู้ดูแล](docs/MAINTAINING.md) |

## ทดลองหนึ่งคำสั่ง

พิมพ์ **ในช่องสนทนา Agent** ไม่ใช่ PowerShell เลือกเพียงบรรทัดของ host ที่ใช้:

| Host | คำสั่งอ่านอย่างเดียว |
| --- | --- |
| Codex | `$agm-analyze ช่วยสรุปโครงสร้างโปรเจกต์นี้จากไฟล์จริง ยังไม่แก้ไฟล์` |
| Claude Code | `/agrimap-agent-skills:agm-analyze ช่วยสรุปโครงสร้างโปรเจกต์นี้จากไฟล์จริง ยังไม่แก้ไฟล์` |
| Antigravity CLI | `/agm-analyze ช่วยสรุปโครงสร้างโปรเจกต์นี้จากไฟล์จริง ยังไม่แก้ไฟล์` |

สิ่งที่ควรได้: คำอธิบายพร้อมตำแหน่งไฟล์ ไม่ใช่การแก้โค้ด สร้าง task หรือรัน test ทั้งโครงการ คำถามทั่วไปพิมพ์ได้ตามปกติ ไม่จำเป็นต้องเรียก skill

**ไม่ต้องจำชื่อ skill (4.9.5):** พิมพ์งานตามปกติ Agent เลือก skill เดียวจาก intent × lane เช่น `ทำไม SP_ORDER_Q ช้า` → `agm-diagnose`, `เพิ่ม API และ SP` → `agm-exec` ดู [ตารางเลือก skill](docs/USAGE.md#skill-routing)

## คำแนะนำที่มีหลักฐาน

Design ทำงานแบบ passive ในคำสั่งที่เหลือ: เสนอเมื่อข้อมูลพอ หากไม่พอให้แจ้งสิ่งที่ขาด แยกข้อเท็จจริงจากสมมติฐาน และบอกข้อจำกัด/ความมั่นใจ คำแนะนำชั่วคราวต้องมีเงื่อนไขชัดเจน ไม่เดาข้อมูลเพื่อเติมคำตอบ และไม่ถือเป็นสิทธิ์ implement

## ขอบเขตที่ควรรู้

- คำสั่งวิเคราะห์ไม่อนุญาตให้แก้โค้ด; คำสั่งแก้โค้ดไม่อนุญาตให้ push หรือ deploy โดยอัตโนมัติ
- ไม่ต้องสร้าง Prompt Result ก่อนทุกงาน ใช้ `agm-prompt` เมื่อต้องการคำสั่งที่เก็บและส่งต่อได้จริง
- SQL context ภายใน `agm-*` อ่าน metadata และ SELECT แบบจำกัด/ปกปิดข้อมูลได้ แต่ห้าม execute database writes หรือ stored procedures; คำสั่งตรงถึง sql-context-pack ใช้ approval gate ของ package นั้น
- Bootstrap ติดตั้งเอกสารโครงการ ไม่สร้าง pipeline หรือ deploy; flow release คือ `develop → jenkins → jenkins-release`
- คำสั่งที่ยกตัวอย่างในเอกสารไม่ใช่การอนุมัติให้ Agent รัน

## ตรวจและอัปเดตแพ็กเกจด้วย agm-doctor

ใช้ `$agm-doctor` เพื่อดูความพร้อม, `$agm-doctor version` เพื่อตรวจรุ่น, `$agm-doctor check` เพื่อตรวจ dependency และ `$agm-doctor update` เพื่ออัปเดต AGM ของ host ปัจจุบัน เลือก host ด้วย `--host codex|claude|antigravity` หรือ pin ด้วย `--to 4.1.0` คำสั่งตรวจอ่านอย่างเดียวและไม่ติดตั้งเครื่องมือที่ขาด ดู [ตารางคำสั่งและสถานะ](docs/DOCTOR.md) และ [Getting Started](docs/GETTING-STARTED.md)

อัปเดตแพ็กเกจแล้วเปิด session ใหม่ หากต้องการอัปเกรด bootstrap ในโครงการใช้ `$agm-release bootstrap upgrade` แยก ไม่เปลี่ยนชื่อ `GEMINI.md`

<a id="agm-release"></a>

## Release ด้วย `$agm-release`

ระบุโครงการเป้าหมาย แล้วพิมพ์คำสั่งในช่องสนทนา Agent ตัวอย่าง `$agm-release release production` คำสั่งในตารางเป็นคำสั่งของสกิล ไม่ใช่คำสั่ง PowerShell ของ CLI

ทั้ง 9 release Flow ตรวจ contract version และ Git, .NET และ CLI `agm-release` ก่อน หากขาดจะติดตั้งจากแหล่งทางการ/แหล่งของโครงการและตรวจซ้ำ หากขาดสิทธิ์หรือเข้าแหล่งติดตั้งไม่ได้ Agent จะแจ้งสาเหตุจริงและขั้นที่ค้าง เครื่องมือที่ใช้งานได้อยู่แล้วจะใช้ต่อ

| คำสั่ง | สิ่งที่ Agent ทำตามลำดับ | เพิ่มเวอร์ชัน | Push ไปที่ใด | ถามก่อนทำไหม |
| --- | --- | --- | --- | --- |
| `$agm-release bootstrap upgrade` | อัปเกรด bootstrap พร้อม backup และรักษากฎเฉพาะโปรเจกต์; ตรวจ version/receipt | ไม่เพิ่ม | ไม่มี | ไม่เกี่ยวข้อง |
| `$agm-release upgrade` | สำรองและทับไฟล์ contract ที่อยู่ใน bundle พร้อมอัปเดต version tracking; README ทับเฉพาะ managed Deployment block | ไม่เพิ่ม | ไม่มี | ไม่เกี่ยวข้อง |
| `$agm-release indexing` | Project Backfill: ตรวจ full reachable history/source/diff → เติม project catalog, historical changelog และ README capability/API tables | ไม่เพิ่ม | ไม่มี; แก้ไฟล์ในเครื่อง | ไม่เกี่ยวข้อง |
| `$agm-release prepare inhouse` | เตรียม Inhouse version → อัปเดต index/changelog → ตรวจความถูกต้อง; ไม่สร้าง release notes | Inhouse +0.0.1 | ไม่มี; เตรียมในเครื่อง | ไม่เกี่ยวข้อง |
| `$agm-release prepare production` | เตรียม version และ notes → ตรวจความถูกต้อง | Production +0.0.1 | ไม่มี; เตรียมในเครื่อง | ยังไม่ถึงขั้น promote |
| `$agm-release pipeline inhouse` | ตรวจ candidate ที่เตรียมแล้ว → commit → push/ตรวจ SHA | ไม่เพิ่มซ้ำ | `develop → jenkins` | ไม่ถาม |
| `$agm-release pipeline production` | ตรวจ Production candidate → commit → push/ตรวจ SHA → เตรียมแผนส่ง Production | ไม่เพิ่มซ้ำ | `develop → jenkins`; ยังไม่ push Production | ไม่ถาม; รอคำสั่ง promote |
| `$agm-release promote` | แสดง SHA/version/notes/tag → push Production → สร้างและ push annotated tag | ไม่เพิ่ม | `jenkins-release` และ tag ของ Production เท่านั้น | ไม่ถาม เว้นแต่ผิดปกติ |
| `$agm-release release full` | indexing → prepare ทั้งสองฝั่ง → notes เฉพาะ Production → pipeline Inhouse/Production ใช้ candidate เดียว → promote → Release Description/แจ้งเตือน Teams | Inhouse และ Production +0.0.1 แยกกัน | `develop → jenkins → jenkins-release` + Production tag | ไม่ถาม เว้นแต่ผิดปกติ |
| `$agm-release release production` | indexing → prepare Production → pipeline Production → promote → Release Description/แจ้งเตือน Teams | Production +0.0.1; Inhouse คงเดิม | ผ่าน `develop → jenkins` ไป `jenkins-release` + Production tag | ไม่ถาม เว้นแต่ผิดปกติ |
| `$agm-release release inhouse` | indexing → prepare Inhouse → pipeline Inhouse | Inhouse +0.0.1 | `develop → jenkins`; ไม่มี Production/tag | ไม่ถาม เว้นแต่ผิดปกติ |

`project.md` ใน Flow นี้คือ `.agrimap-agent/memory/project.md` ส่วน changelog คือ `changelog.md` ที่ root ของโครงการ ใช้ Version ที่เจ้าของระบุชัด หรือเพิ่ม PATCH เป็นค่าเริ่มต้น เช่น `1.2.9 → 1.2.10` โดยอ่าน Inhouse จาก `Jenkinsfile` และ Production จาก `Jenkinsfile_Production` หากทำต่อจาก candidate เดิมจะไม่เพิ่มเลขซ้ำ

หากยังไม่มี Project Memory คำสั่ง indexing/prepare/release จะทำ indexing จากหลักฐานและสร้าง `.agrimap-agent/memory/project.md` พร้อมโฟลเดอร์ที่จำเป็นให้ใน flow เดิม ไม่ต้องสั่ง Project Backfill หรือ bootstrap แยก โดย indexing รวม Project Backfill และต้องพิสูจน์ coverage ก่อนจบ ส่วน standalone prepare ไม่อ้าง full backfill จาก scoped indexing ส่วน standalone pipeline/promote ต้องพิสูจน์ candidate ที่เตรียมแล้วก่อน reconstruct memory

**Release Description (4.9.4):** `release production|full` เขียนสรุปภาษาคนให้ BA ส่งลูกค้าได้ และส่งแจ้งเตือน Teams แบบสั้น (ชื่อ project, version, รายการที่แก้และ project ที่เกี่ยวข้อง) ผ่าน `tools/agrimap/release-notify.mjs` ไปที่ `…/agrimap-notify/release-description` (env `NOTIFY_WEBHOOK_URL`, ตรวจ `/healthz` ก่อนส่ง) แยกจาก Jenkins build card ข้ามการส่งด้วย `--silent` หรือ `--skip-noti` ดู [Release](docs/RELEASE.md)

**Release notes และ tag เป็นของ Production เท่านั้น:** ถ้า candidate Inhouse เป็น `1.0.6` และ Production เป็น `1.0.3` ให้สร้าง `release-notes/1.0.3.md` และใช้ tag `v1.0.3` ห้ามนำเลข Inhouse ไปสร้าง `release-notes/1.0.6.md` งาน Inhouse-only ไม่แก้ `release.md` หรือ versioned notes ประวัติเดิมต้องคงอยู่

คำสั่ง `pipeline` และ `promote` แบบแยกขั้นต้องมี candidate ที่เตรียมแล้ว หากยังไม่มี Agent จะแจ้ง prerequisite ไม่เลือก `prepare both` หรือเพิ่มเลขเอง ส่วน `release full/production/inhouse` ทำทุกขั้นที่อนุญาตต่อเนื่อง AI หา SHA ตรวจเครื่องมือ และแก้ปัญหาตามหลักฐานเอง มนุษย์ไม่ต้องสร้าง SHA หรือรัน Git

สกิลตรวจความเข้ากันได้ของ CLI ก่อน prepare ด้วย: source CLI ที่ตรวจพบยังสร้าง notes ตาม environment ในบาง mode และตรวจ Tag metadata ใน notes จึงไม่ถือว่า CLI ที่ติดตั้งได้จะรองรับ Flow ใหม่ครบโดยอัตโนมัติ หากเป็นข้อขัดแย้งกับ gate ที่ target บังคับ จะเก็บหลักฐานและหยุดขั้นที่เกี่ยวข้อง ไม่สร้าง notes ผิดฝั่งหรืออ้างว่าตรวจผ่าน

**คำสั่งคือการยืนยัน (5.0.1):** พิมพ์ `$agm-release release full --flash` แล้ว Agent ทำจนจบทั้ง Inhouse, Production, tag และแจ้งเตือน โดยไม่ถาม Agent ถามหนึ่งครั้งก่อน push แรกเฉพาะเมื่อผิดปกติ: (1) ระบุเลขเองที่ไม่ใช่ +0.0.1 เช่น Production ตอนนี้ 1.0.3 แต่สั่ง `version 1.0.5` (ข้ามเลข) หรือเลขต่ำกว่าที่ออกไปแล้ว (2) มีงานที่ไม่ได้อยู่ในรอบนี้เข้ามาใน candidate หรือ SHA/tag ปลายทางเปลี่ยนจากแผน ส่วน conflict, test ไม่ผ่าน, tag ชน หรือไม่มีสิทธิ์ ไม่ใช่คำถาม: Agent หยุดเฉพาะขั้นนั้นพร้อมหลักฐาน ถ้าโครงการใดต้องการให้ถามก่อน Production ให้เขียนกฎนั้นใน `PROJECT CUSTOM` ของ `AGENTS.release.md`

Pipeline ในตารางหมายถึงส่ง Git branch ตามลำดับภายใต้ trigger ที่ server ตั้งไว้ ไม่ต้องรอ Jenkins เขียว และไม่ใช่หลักฐานว่า deploy ขึ้น server สำเร็จ หลังจบจะบันทึกผล audit ตามกฎของโครงการ; audit commit บน develop จะไม่ถูก promote/tag เพิ่ม คำสั่งใหม่ไม่เหมารวมสิทธิ์เผยแพร่งานค้างที่ไม่เกี่ยวข้อง

รายละเอียดสำหรับ Agent: [Release contract](skills/agrimap-agent-skills/references/release-workflow.md) · [Flow เดิมและ Bootstrap](docs/RELEASE.md)

ขั้นตอนครบทั้ง 9 คำสั่ง: [Release steps](skills/agrimap-agent-skills/references/release-steps.md) · ตรวจ/ติดตั้ง .NET Tool และแก้ปัญหา: [Release tools](skills/agrimap-agent-skills/references/release-tools.md)

กฎเดียวกันใช้กับกลุ่มโมเดลที่ผู้ใช้ระบุ: GPT-5.4/5.5, GPT-5.6 Luna/Terra/Sol, GPT-6 Astra ขึ้นไป; Claude Sonnet 5, Opus 4.8/5; Antigravity CLI โดยบันทึก model จริงที่ runtime แจ้ง หรือ unknown รายชื่อนี้เป็นเป้าหมายการใช้งาน ไม่ใช่ผลรับรองว่าทดลองทุกโมเดลแล้ว

## การบันทึกงาน

<!-- BEGIN GENERATED TASK ARTIFACT SCHEMA -->
Ordinary answers: no execution/task artifacts. Bounded writes: concise memory/audit.
Tracked v3 work: one task.md with scope, acceptance, progress, evidence and result.
Separate analysis/QA/results/reports are consumer-requested deliverables, not a five-file gate.
Legacy v2 five-file validation remains in assets/task-artifact-schema.json for existing executions only; it is not the new-work checklist.
<!-- END GENERATED TASK ARTIFACT SCHEMA -->

## สำหรับผู้ดูแล package

ต้นฉบับอยู่ใน `config/operations.json`, `skills/agrimap-agent-skills/`, `docs/` และ `examples/` แก้ต้นฉบับแล้วใช้ `npm run sync`; อย่าแก้ generated mirror แยกเอง อ่าน [วิธีตรวจและแจกจ่าย](docs/MAINTAINING.md) ก่อนรันคำสั่งผู้ดูแล

Repository: [orchex006/agrimap-agent-skills](https://github.com/orchex006/agrimap-agent-skills) · [Changelog](CHANGELOG.md)

เลขเวอร์ชันใน source ไม่ได้ยืนยันว่า remote หรือ plugin cache ของผู้ใช้ได้รับเวอร์ชันนั้นแล้ว

ตัวอย่างการบันทึก host ใหม่ใช้ **Antigravity CLI**: `provider=antigravity`, `model=unknown` เมื่อ runtime ไม่แจ้ง model ดู [ตัวอย่าง recording](docs/USAGE.md#antigravity-cli-recording-example) ส่วน Antigravity CLI adapter เดิมยังเก็บเพื่อ compatibility
