# ดูแลและพัฒนา skill package

[หน้าหลัก](../README.md) · [เริ่มใช้งาน](GETTING-STARTED.md) · [Migration](MIGRATION-3.0.md)

หน้านี้สำหรับผู้ดูแล package หรือ Agent ที่ต้องใช้ runtime โดยตรง ผู้ใช้ทั่วไปไม่ต้องรัน start/checkpoint/complete เอง และไม่ต้อง clone repository เพื่อถามคำถาม

## แผนที่ source

| ตำแหน่ง | เจ้าของเนื้อหา |
| --- | --- |
| config/operations.json | ชื่อ/description/actions/ตัวอย่าง/เส้นทาง references ของ operation |
| skills/agrimap-agent-skills/SKILL.md | Router เท่านั้น |
| skills/agrimap-agent-skills/references | กฎและความรู้ที่ Agent โหลดตามงาน |
| skills/agrimap-agent-skills/scripts | Runtime, hooks, validators และ bootstrap |
| skills/agrimap-agent-skills/assets/bootstrap | เอกสารโครงการ canonical พร้อม hashes |
| docs และ examples | คู่มือผู้ใช้/ผู้ดูแลและโจทย์ตัวอย่าง |
| commands, skills/agm-*.md, plugin.json, plugins/agrimap-agent-skills | Generated adapters และ mirror; ไม่แก้โดยตรง |
| tests | Regression/fixture tests ไม่ใช่ project service |
| .agrimap-agent | Local evidence ของการพัฒนา package ไม่ใช่ไฟล์แจกจ่าย |

Golden patterns และ manifests เป็นหลักฐานอ้างอิง ไม่เปลี่ยน bytes หรือ rehash เพื่อให้ validator ผ่านโดยไม่ตรวจ provenance เอกสารเก่าใน CHANGELOG และ v2 fixtures เป็นประวัติ ไม่ใช่กฎ v3

## ตรวจและเผยแพร่จากเครื่อง

Repository ปัจจุบันคือ `cognivex006/agrimap-agent-skills` ใช้ `npm run package:verify` ตรวจและ build preview ในเครื่อง ส่วน `npm run package:publish -- --version <version> --latest false` สร้าง tag และ GitHub Release จริง จึงต้องได้รับอนุญาตเผยแพร่ก่อน ดู `DEVELOPMENT.md` ใน source repository (เอกสารผู้ดูแลไม่รวมใน runtime archive)

ไม่มี GitHub Actions สำหรับ CI/release แล้ว การตรวจครอบคลุมเฉพาะ OS ที่รัน ไม่มี matrix Windows/Linux อัตโนมัติ และไม่มี approval จาก Actions environment เดิม ผู้ดูแลต้องนำ required checks ของ Package CI ออกจาก branch protection/rulesets เอง พร้อมรักษากฎ PR และการป้องกัน tag

การย้าย remote ไม่ได้ย้าย release assets รุ่นเก่าโดยอัตโนมัติ ตรวจรุ่นและไฟล์ที่ปลายทางจริงก่อนแนะนำการติดตั้ง; local tags และ changelog ไม่ใช่หลักฐานว่า release บัญชีใหม่พร้อมใช้งาน

## แก้ไขและตรวจให้พอดี

**Terminal จาก root ของ package:**

```powershell
npm run sync
npm run validate
```

sync สร้าง operation entrypoints, aliases, Antigravity flat skills/root plugin.json, legacy Gemini commands, manifests และสำเนาเอกสารจากต้นฉบับ จึงเขียนทับ generated files ตรวจ diff ต้นฉบับก่อนสั่ง ไม่ใช้ sync กับโครงการ product

- เอกสารอย่างเดียว: ตรวจลิงก์ ความถูกต้องของคำสั่ง และ generated mirrors
- `npm run test:docs` ตรวจเอกสารและ negative fixtures โดยไม่ execute ตัวอย่าง install/release
- Runtime/script เปลี่ยน: รัน targeted tests ที่เกี่ยวข้อง
- ก่อนส่ง package ที่เปลี่ยนหลาย contract: `npm test` เป็น release gate ของ package
- Routes/budgets เปลี่ยน: `npm run audit:tokens:strict`
- อย่ารัน test:workspace, test:usage, test:integration ต่อกันโดยอัตโนมัติ ทั้งสามเป็นชื่อ compatibility ที่เรียก v3 fixture suite เดียวกัน
- test:legacy-v2 เก็บ expectations รุ่นเก่าไว้ ไม่ใช่ v3 acceptance gate

Token estimates ไม่ใช่ผล benchmark model จริง และ npm test ไม่ใช่การ test against database หรือ Jenkins

<a id="local-install"></a>
## ติดตั้งจาก working copy

ใช้เมื่อต้องลอง source ที่ยังไม่ publish สั่ง sync และ validate ก่อน แล้วเลือก host เดียว **คำสั่งนี้เปลี่ยน host installation/configuration** ไม่ใช่ส่วนบังคับของการตรวจ docs

ถ้าใช้ runtime artifact จาก [รุ่นที่ระบุ](VERSIONS.md) ให้แตกไฟล์และตรวจ checksum ก่อน แล้วใช้คำสั่ง host ด้านล่างได้เลย ไม่รัน sync/validate ของ source ใน artifact

Terminal ต้องอยู่ root package ที่มี package.json และ marketplace manifests:

Codex:

```powershell
codex plugin marketplace add .
codex plugin add agrimap-agent-skills@agrimap-agent-skills
```

Claude Code:

```powershell
claude plugin marketplace add .
claude plugin install agrimap-agent-skills@agrimap-agent-skills
```

Antigravity CLI (ติดตั้ง local package):

```powershell
agy plugin install .
```

หาก marketplace ชื่อเดียวกันชี้ remote อยู่แล้ว ให้ตรวจรายการและ source ที่ host เลือกก่อน อย่าสมมติว่ารัน add ซ้ำแล้วเปลี่ยน source/cache สำเร็จ ใช้ help ของรุ่นนั้นและขั้นตอนจัดการ marketplace ของ host ไม่ลบ cache เอง

เปิด session ใหม่และตรวจ installed version/path การ sync repository ไม่ refresh cached plugin ของ session เดิม และไม่เท่ากับเผยแพร่ GitHub

## Provider adapters

Codex/Claude เลือก hooks คนละไฟล์ผ่าน manifest ไม่สร้าง default hooks/hooks.json ร่วมใน plugin root ส่วน Antigravity ใช้ root plugin.json และ skills/agm-*.md ที่ชี้ bundled references โดยตรง; ยังไม่ผูก legacy hooks/MCP เข้ากับ AGY โดยไม่ตรวจ payload/path support ของ host จริง ส่วน legacy Gemini adapter ยังคง root extension hooks และ read-only stdio MCP

MCP ของ package นี้ให้ reference text ไม่ใช่ SQL connection ไม่มีการติดตั้ง sql-context-pack แฝงไปด้วย ต้องมี external skill/service และ connected profile ที่ใช้ได้อยู่แล้ว

## Runtime: ใช้เฉพาะเมื่อจำเป็น

คำสั่งด้านล่างเป็นตัวอย่าง **PowerShell** แทน path, session, ชื่อคนและ model ด้วยค่าจริงก่อนรัน:

```powershell
$agmPackage = 'D:\path\to\agrimap-agent-skills'
$agmProject = 'D:\path\to\target-project'
$agmScripts = Join-Path $agmPackage 'skills/agrimap-agent-skills/scripts'
```

**ยืนยันผู้สั่งงาน** เมื่อได้รับชื่อจากคนนั้นแล้วเท่านั้น; ตัวอย่างนี้เลือก persistent confirmation อย่างชัดเจน:

ถ้ามีชื่อที่ยืนยันแล้วในบทสนทนาให้ใช้ชื่อนั้นได้เลย หากต้องค้น local evidence ใช้ `node "$agmScripts/agm-workspace.mjs" requester --cwd "$agmProject" --session "[actual-session]"` แบบอ่านอย่างเดียว Hook และ runtime ใช้ resolver เดียวกัน ค้น session ปัจจุบัน, local-user record และ session ที่ยืนยันยังใช้ได้ของเครื่อง/ผู้ใช้เดียวกันใน workspace นี้ก่อนถามชื่อ ไม่ใช้ Git author อย่างเดียวเป็น confirmation

```powershell
node "$agmScripts/agm-workspace.mjs" identify --cwd "$agmProject" --session "[actual-session]" --owner "[confirmed-human]" --model "[host-reported-model]" --provider codex --confirmation-hours 0
```

เปลี่ยน provider ตาม host จริง ไม่ใช้ชื่อ model เป็น provider และไม่เอา OS/Git username มาแทนการยืนยัน

**เริ่มงาน bounded ที่อนุมัติแล้ว**:

```powershell
node "$agmScripts/agm-workspace.mjs" start --cwd "$agmProject" --session "[actual-session]" --operation execute --title "Implement the authorized bounded change"
```

ต้องการ resume/handoff เพิ่ม `--tracking` ส่วน `--risk` ใช้เฉพาะเหตุผลจริง: external-publication, persisted-data-change, public-contract-change, independent-assurance, security-boundary ไม่ใช่สิทธิ์ execute SQL writes

เพิ่ม `--requested-by "[confirmed-human]"` ได้เมื่อตัวตนยืนยันในบทสนทนาแล้วแต่ยังไม่มี local record ไม่ต้องถามยืนยันชื่อเดิมซ้ำ หาก source ยืนยันหมดอายุ/ถูกเพิกถอนหรือมีหลายคนขัดกัน resolver จะไม่เลือกจาก Git/OS แทน

ไม่ต้องระบุ --depth ตามอำเภอใจ runtime ตรวจว่า depth ตรงกับ tracking/risk ส่วนคำถาม read-only ไม่ start เว้นแต่ร้องขอ persistent deliverable

**บันทึกหลักฐานหลังตรวจจริง** ใช้ executionId ที่ start คืนมา:

```powershell
node "$agmScripts/agm-workspace.mjs" checkpoint --cwd "$agmProject" --session "[actual-session]" --execution "[returned-execution-id]" --event verified --status passed --summary "[observed-outcome]" --verification "[actual-check-and-result]"
node "$agmScripts/agm-workspace.mjs" complete --cwd "$agmProject" --session "[actual-session]" --execution "[returned-execution-id]"
```

อย่าใส่ passed ล่วงหน้า ถ้าล้มเหลวใช้ failed หรือ blocked ตามจริง สำหรับ tracked work ให้อัปเดต savepoint (checkpoint --done/--remaining/--next) ให้ตรงกับงานจริง; validate เตือนเมื่อยังมีรายการ Remaining ค้าง และ complete ไม่ใช้ไฟล์เปล่าเป็นหลักฐานสำเร็จ ใช้ --report เฉพาะมีผู้รับรายงานแยกจริง

<a id="bootstrap-cli"></a>
## Bootstrap CLI

ใช้ตัวแปร path ที่กำหนดด้านบนและชนิด target จริง: fe-main, be-main, fe-library หรือ be-library

**Preview อ่านอย่างเดียว:**

```powershell
node "$agmScripts/project-bootstrap.mjs" plan --target "$agmProject" --kind be-main
```

**Apply เขียนเอกสาร — หลังอนุมัติ target/adoption แล้ว:**

```powershell
node "$agmScripts/agm-workspace.mjs" init --cwd "$agmProject" --bootstrap --kind be-main
```

Plain init เตรียม local knowledge ไม่ติดตั้ง project documents ส่วน identify ไม่ bootstrap เลย ถ้า plan มี conflict ให้แก้ adoption decision ก่อน ไม่รันซ้ำหวังให้ overwrite

`agm-release bootstrap upgrade` ใช้ normal plan/apply นี้พร้อม merge กฎเฉพาะและ backup ส่วน `agm-release upgrade` เดิมใช้ `project-bootstrap.mjs plan --upgrade` แล้ว `project-bootstrap.mjs upgrade` เพื่อแทนที่ scoped contract โดยชัดเจน ทั้งสองเป็น Agent actions ไม่ใช่ subcommands ของ .NET release CLI และไม่เปลี่ยน version owner หรือเผยแพร่ Git

หาก Agent merge custom rules เอง ต้องสำรอง bytes เดิม ตรวจเนื้อหากับ bundle แล้วส่ง `--reviewed-merges <json-file>` ให้ normal plan/apply รายการมี `target`, `sha256`, `backupHash`, `reason` ตาม [release-workflow](../skills/agrimap-agent-skills/references/release-workflow.md#explicit-contract-upgrade) receipt ผูกการ review กับ hash ของไฟล์และ bundle รุ่นนั้น เมื่อเนื้อหาหรือ bundle เปลี่ยนต้องตรวจใหม่ ไม่ใช้ flag นี้แทน semantic review

## แหล่งอ้างอิงการติดตั้ง

รูปแบบการติดตั้งแยกตาม host อยู่ที่ [Getting Started](GETTING-STARTED.md) ซึ่งระบุ official sources และวันที่ตรวจ CLI help แล้ว ไม่คัดลอกคู่มือ host ทั้งชุดลง reference ของ Agent

## SQLFluff version lock

Canonical lock: `skills/agrimap-agent-skills/assets/tool-versions.json`. Skill 3.6.0 pins SQLFluff 4.2.2. When changing the library, edit `sqlfluff.version`, validate representative T-SQL formatting and artifact checks, bump the skill version, then run sync. The generator stamps `skillVersion` and distributes the lock. Before SQL writes, the agent runs `install-sqlfluff.mjs`: exact matches are reused; missing, older or newer installs are aligned to the pin and the executable is verified. Installation requires an available Python/pip and package access; failures block formatting with evidence. Plugin installation itself does not execute pip: alignment happens before the next SQL-formatting invocation.
