# Bootstrap, Version และ Release

[หน้าหลัก](../README.md) · [Workflow](WORKFLOWS.md) · [Cookbook](COMMAND-COOKBOOK.md)

คำสั่งปัจจุบันใช้ [release-workflow](../skills/agrimap-agent-skills/references/release-workflow.md), [release-steps](../skills/agrimap-agent-skills/references/release-steps.md) และกฎของ target ภายใต้สิทธิ์ที่ผู้ใช้ให้ ส่วน [canonical project AGENTS](../skills/agrimap-agent-skills/assets/bootstrap/AGENTS.md) เป็นต้นทาง bootstrap และ legacy intents หน้านี้ไม่ใช่คำสั่งเผยแพร่ตัว skill package และการอ่านตัวอย่างไม่อนุญาตให้ execute

## คำสั่ง agm-release ทั้งหมดใน 4.5.2

ระบุโครงการเป้าหมายแล้วพิมพ์ใน Agent chat: Codex ใช้ `$agm-release`, Claude ใช้ `/agrimap-agent-skills:agm-release`, Antigravity ใช้ `/agm-release` ตามชื่อที่ลงทะเบียน Agent เป็นผู้ตรวจและดำเนินการ คำสั่งเหล่านี้ไม่ใช่ syntax ของ .NET CLI

| Arguments | งานและผลลัพธ์ | Version / publication boundary |
| --- | --- | --- |
| `bootstrap upgrade` | ตรวจรุ่น bootstrap → plan → backup/อัปเดต template หรือ merge กฎเฉพาะ → ตรวจ receipt | เฉพาะ bootstrap ในเครื่อง; ไม่ bump/push/tag |
| `upgrade` | โหมดเดิม: สำรองและแทนที่ contract ใน bundle รวม README เฉพาะ Deployment block | แทนที่ custom contract โดยชัดเจน; ไม่ bump/push/tag |
| `indexing` | Project Backfill: full reachable history, project catalog, historical changelog และ README capability/API inventory | แก้หลักฐานใน target; ไม่ bump/push/tag |
| `prepare inhouse` | เตรียมและ verify candidate Inhouse พร้อม scoped index/changelog | เลขที่ระบุ หรือ PATCH+1; ไม่สร้าง versioned notes/push/tag |
| `prepare production` | เตรียมและ verify candidate Production, release.md และ versioned notes | เลขที่ระบุ หรือ PATCH+1; ยังไม่ push/tag |
| `pipeline inhouse` | ตรวจ candidate ที่เตรียมแล้ว → commit paths ที่ตรวจ → push/verify develop และ jenkins | ไม่ bump ซ้ำ; ไม่มี Production/tag |
| `pipeline production` | ตรวจ Production candidate → commit → push/verify develop และ jenkins → เตรียมแผน Production | หยุดก่อน jenkins-release และ tag |
| `promote` | ตรวจ candidate → แสดง SHA/version/branch/tag → publish/verify Production และ annotated tag → Release Description/แจ้งเตือน | ต้องมี candidate ที่เตรียมแล้ว; ไม่ถาม เว้นแต่ผิดปกติ |
| `release full` | indexing → prepare owners แยกกัน → pipeline inhouse/production → promote → Release Description/แจ้งเตือน | เลขตามคำขอ หรือ PATCH+1 แยก owner; notes/tag เฉพาะ Production |
| `release production` | indexing → prepare production → pipeline production → promote → Release Description/แจ้งเตือน | Inhouse version คงเดิม แม้ผ่าน branch jenkins |
| `release inhouse` | indexing → prepare inhouse → pipeline inhouse | เฉพาะ develop/jenkins; ไม่แก้ Production notes/tag |

เลข Version/Patch ที่ผู้ใช้ระบุชัดมีลำดับเหนือค่า PATCH+1 และกฎ default รุ่นเก่า อ่าน baseline จริงก่อนคำนวณ ไม่ถามอนุมัติเลขเดิมซ้ำ เช่น Inhouse `1.0.0 → 1.0.8` และ Production `1.0.4 → 1.0.5` ต้องได้ notes `1.0.5.md` และ tag `v1.0.5` ไม่ใช้เลข Inhouse แทน

## เวลา Release และไฟล์ประวัติ (4.5.2)

ทุก release action รวม `--flash` รายงานเวลา 2 ค่า: **Elapsed** ตั้งแต่เริ่มรับงานจนตรวจปิดงานเสร็จ รวมเวลารอชื่อ requester/confirmation และ **Active** ผลรวมเวลาทำงานจริงแต่ละ step ซึ่งไม่รวมช่วงรอผู้ใช้ เช่น indexing 3 + hash 5 + changelog 1 + Inhouse 1 + Production 2 + tag 1 = 13 นาที; ถ้ารอยืนยัน 7 นาที Elapsed จะเป็น 20 นาที ตัวเลขนี้เป็นตัวอย่าง ไม่ใช่เวลารับประกัน งาน readiness/verification/final audit ที่ทำจริงต้องนับด้วย

Agent ใช้ตัวจับเวลาใน bundle เก็บสถานะนอกไฟล์ที่จะ commit เปลี่ยน step ก่อนทำงานและหยุดนับ Active ก่อนรอคำตอบ การ retry นับเวลาที่ใช้เพิ่มจริง งานขนานนับเพียงครั้งเดียว ถ้าหยุด session หรือไม่มีหลักฐานเวลาเพียงพอ ต้องรายงานส่วนที่วัดไม่ได้ ไม่เดาตัวเลข ดู [Timing contract](../skills/agrimap-agent-skills/references/release-timing.md)

คำสั่งที่มี publication รวม `history.md` และ audit ที่เกี่ยวกับ release และผ่านการตรวจแล้วใน scope commit/push เดิม ก่อน commit candidate ต้องตรวจประวัติด้วย หลัง confirmation ให้ตรวจซ้ำและรวมส่วนที่เพิ่มใหม่ใน commit audit สุดท้ายบน develop พร้อมตรวจ remote และไฟล์ตกค้าง แยก SHA ของ candidate กับ final develop; ไม่เปลี่ยน tag หรือ promote audit ตามไปด้วย งานอื่น ไฟล์ที่ ignore และข้อห้ามของ target ยังต้องรักษา ส่วน indexing/prepare ยังคงเป็นงาน local

## งานค้าง, Release Description และแจ้งเตือนทีม (4.9.3)

**งานค้าง:** `release` และ `pipeline` รวมไฟล์ที่ยังไม่ commit และ commit บน develop ที่ยังไม่ขึ้น remote เข้า release ให้อัตโนมัติ (ตรวจข้อมูลลับก่อนเสมอ) เก็บไว้ local เฉพาะเมื่อสั่งยกเว้น หลัง release Agent commit `audit:` แล้ว push develop หนึ่งครั้งให้ clean โดยไม่ promote ไป jenkins/jenkins-release และไม่แตะ tag

**Release Description และ tag:** `release production`, `release full` (รวม `--flash`) และ `promote` สร้างและ push annotated tag ทุกครั้ง และส่ง Release Description ทุกครั้งที่ tag ผ่าน รวมกรณีที่หยุดรอยืนยันแล้วจบด้วย `promote` (ตั้งแต่ 4.9.8; bootstrap ที่ใหม่กว่าไม่ขวางขั้นนี้) Agent เขียนสรุปภาษาคนที่ BA copy ส่งลูกค้าได้ทันที และแสดงในคำตอบสุดท้ายทุกครั้ง:

```markdown
# AgriMap Platform / 1.4.2

- เพิ่มการเข้าสู่ระบบด้วย ThaiD
- แก้แบบฟอร์มให้บันทึกวันที่และช่วงเวลาได้ครบ
- ปรับขั้นตอนเข้าสู่ระบบให้รองรับการยืนยันตัวตนแบบใหม่ (เกี่ยวข้อง: agmws-identity-netcore)
```

ข้อที่มาจากหรือต้องตามไปแก้ project อื่น เช่น API ของ `agmws-identity-netcore` หรือ package `@agrimap/*` ปิดท้ายด้วย `(เกี่ยวข้อง: <project>)` โดยไม่ลงรายละเอียดเทคนิค

**แจ้งเตือน Microsoft Teams มี 2 แบบ:** Jenkins build card (`POST …/release`) ส่งจาก Jenkinsfile ตามเดิม ส่วน Release Description (`POST …/release-description`) ส่งเฉพาะชื่อ project, version และรายการที่แก้พร้อม project ที่เกี่ยวข้อง Agent ส่งผ่าน `node tools/agrimap/release-notify.mjs send` (managed bootstrap file ถูกแทนที่ทุกครั้งที่อัปเดต bootstrap) script ตรวจ `GET …/healthz` ก่อน POST ทุกครั้ง และอ่าน URL จาก env `NOTIFY_WEBHOOK_URL` (`https://appserv2.cdg.co.th/agrimap-notify/release-description`) ถ้าเครื่องยังไม่มี Agent ขอ URL ครั้งเดียวแล้วบันทึกด้วย `set-url` ถ้าปลายทางไม่พร้อม release ยังสำเร็จและรายงาน notify เป็น `pending` พร้อมคำสั่งส่งซ้ำ

ข้ามการส่ง (ยังเขียนและแสดงสรุป) ด้วย `--silent` หรือ `--skip-noti`:

```text
$agm-release release production --silent
$agm-release release full --flash --silent
```

**รูปแบบ commit ของทีม (บังคับตั้งแต่ 4.9.6):** `feature:`, `fix:`, `comment:` สำหรับงานพัฒนา และ `bump:`, `audit:`, `ci:` สำหรับ commit ที่ agm-release สร้างเอง ดูตารางว่า Agent ใช้แบบไหนเมื่อไรใน [Usage](USAGE.md#agent-commit-style)

**รวมงานที่เสร็จก่อน release (4.9.6):** prepare, pipeline และ release รวม work branch ที่ส่งงานแล้วและ test ผ่านเข้า `develop` ให้ก่อนเตรียม version ดู [Usage](USAGE.md#release-gather)

## การตัดสินใจและขอคำยืนยัน

### Release แบบเร็ว: --flash

พิมพ์ใน Agent chat (ไม่ใช่ flag ของ .NET CLI):

```text
$agm-release release full --flash
$agm-release release inhouse --flash
$agm-release production --flash
```

ชื่อย่อ `full --flash`, `inhouse --flash`, `production --flash` เท่ากับ `release full|inhouse|production --flash` ตามลำดับ ใช้กับ `prepare inhouse|production` และ `pipeline inhouse|production` ได้ด้วย (pipeline ไม่สร้าง candidate ที่ยังไม่ได้เตรียม) โหมดไม่มี flag ยังทำงานเหมือนเดิม ไม่รองรับ flag นี้กับ promote/indexing/bootstrap

ตั้งแต่ 4.9.9 release (รวม `--flash`) รวมแค่ branch ของงานนี้ แก้ conflict เอง sync `jenkins`/`jenkins-release` เอง และไม่ดู branch อื่น ไม่มีการยืนยัน Production แล้ว (5.0.1) ถามเฉพาะความผิดปกติ ดู [Usage](USAGE.md#release-preflight)

**URL แจ้งเตือน:** เครื่องที่ยังไม่เคยตั้ง Agent ถามผ่านกล่องคำถาม ตัวเลือกแรกคือ URL มาตรฐาน `https://appserv2.cdg.co.th/agrimap-notify/release-description` เลือกแล้วตั้งค่าและส่งต่อทันที

| ส่วนงาน | --flash |
| --- | --- |
| Index | ตรวจ baseline → candidate และ dirty files ไม่ backfill ทั้งโครงการหรือสร้าง README/catalog ใหม่ |
| Version/notes | ขึ้นเลขเฉพาะ owner ที่เลือกตามคำขอหรือ PATCH+1; notes/tag เป็นของ Production เท่านั้น |
| Verification | ตรวจ diff, SHA, secret/ขอบเขต, version, ancestry และ tag; ใช้ผล tests/build เดิมเมื่อยังตรงกับเนื้อหาและ environment ไม่ใช่ skip tests อัตโนมัติ |
| Publish | candidate เดียว; develop → jenkins → jenkins-release ตาม environment; ไม่ push checkpoint สำเร็จซ้ำ |
| Audit | สรุป delta สั้น ๆ; รวม history/audit ของ release ที่ตรวจแล้วเป็น develop-only รอบสุดท้ายเว้นแต่มีข้อห้ามชัดเจน ไม่ promote ตาม |

ถ้า baseline ไม่ชัด Agent ถามเฉพาะจุดนั้น ไม่แอบกลับไป index ทั้ง project และไม่อ้างว่า full indexing เสร็จแล้ว Production ไม่ถามยืนยันเช่นเดียวกับโหมดปกติ โหมดนี้ไม่แก้ trigger ของ Jenkins และไม่รับประกันจำนวน pipeline หรือเวลาแน่นอน รายละเอียด: [Flash contract](../skills/agrimap-agent-skills/references/release-flash.md)

Agent ประเมิน scope, diff, เจ้าของงาน และการกู้คืนก่อนทำงาน ขั้นตอนที่ปลอดภัยและอยู่ในสิทธิ์ของคำสั่งเดิมให้ทำต่อพร้อม progress สั้น ๆ ไม่ถามยืนยันทุกครั้ง เช่น pull แบบ fast-forward ที่ปลอดภัย, bootstrap ที่มี backup, เตรียม notes และตรวจ candidate ส่วน prepare/indexing ไม่ได้รับสิทธิ์ push เพิ่มจากกฎนี้

**คำสั่งคือการยืนยัน (owner decision 2026-10-14, 5.0.1):** คำสั่ง `release full|production|inhouse`, `pipeline` และ `promote` (รวม `--flash`) ยืนยันทุกขั้นที่คำสั่งนั้นครอบคลุม รวม `jenkins-release`, Production tag และแจ้งเตือน Agent แสดงแผน (version, SHA, tag) เป็นบรรทัด progress แล้วทำต่อ ถามหนึ่งครั้งก่อน push แรกเฉพาะเมื่อผิดปกติ: ระบุเลขเองที่ไม่ใช่ PATCH+1 (ข้ามเลข เปลี่ยน minor/major หรือต่ำกว่าที่ออกไปแล้ว) หรือมีเนื้อหาที่ run นี้ไม่ได้เตรียมเข้ามาใน candidate/ปลายทางหรือ tag เปลี่ยนจากแผน คำถามสรุปสั้น ๆ ว่า **อะไร / หลักฐาน / ผลกระทบ / คำสั่งกู้คืนและข้อจำกัด** หาก retry/resume แล้วคำตอบเดิมยังตรง ให้ทำเฉพาะขั้นที่เหลือ ไม่ถามหรือ push checkpoint ที่สำเร็จซ้ำ

ยังต้องหยุดก่อนขั้นที่มีขอบเขตไม่ชัด เสี่ยงสูญเสียงาน หรือสิทธิ์ไม่พอ (หยุดเฉพาะขั้นนั้นพร้อมหลักฐาน ไม่ใช่คำถามยืนยัน) การกู้คืนได้ไม่ใช่สิทธิ์เพิ่มและไม่ข้าม server approval: revert Git ไม่ได้ย้อน pipeline/deployment ที่เริ่มแล้ว ห้ามเสนอ force-push หรือย้าย/ลบ published tag เป็นทางลัด และแผน rollback ยังไม่ใช่คำสั่งให้ลงมือ rollback

## ความสามารถร่วมและการทำต่อเมื่อพบปัญหา

| ความสามารถ | พฤติกรรมและขอบเขต |
| --- | --- |
| Tool/prerequisite repair | เก้า release actions ตรวจ Git, .NET และ release CLI; ติดตั้งสิ่งที่ขาดจากแหล่งที่ยืนยันใน scope เดิม ตรวจผลก่อนทำต่อ ส่วน bootstrap actions ใช้ Node และ profile ที่พิสูจน์ได้เท่านั้น |
| Bootstrap freshness | ตรวจ marker/receipt ของ target เทียบ bundle; อัปเดต template ที่รู้จักและรักษากฎเฉพาะ ไม่ต้องสั่ง bootstrap แยกทุกครั้ง |
| Branch freshness ในโฟลเดอร์เดิม | ก่อนเขียน release ตรวจ develop/jenkins/jenkins-release เทียบ remote ของแต่ละ branch; pull --ff-only เฉพาะที่ตามหลังและ switch ได้อย่างปลอดภัย ไม่ clone/สร้าง worktree อัตโนมัติ; จำแนก dirty และแก้ปัญหาในที่เดิม |
| Backfill / missing memory | indexing และ composite I step ต้องพิสูจน์ full-history coverage ใช้หลักฐานเดิมต่อและเก็บผลถาวรใน target; standalone prepare ทำ scoped prerequisite indexing ไม่อ้าง full backfill |
| CLI compatibility | ตรวจ supported options และผลต่อ owner/artifacts ก่อนใช้; หาก CLI รองรับแค่ PATCH+1 แต่ผู้ใช้ระบุเลข ให้ใช้ scoped direct preparation และ equivalent checks ตาม release-tools โดยรายงาน gate ที่ incompatible จริง |
| Candidate ownership | pipeline/promote แบบ standalone ไม่สร้าง candidate หรือ bump เพื่อแก้ prerequisite โดยอัตโนมัติ ต้องพิสูจน์แหล่งที่มาและ exact owner diff |
| Resume / verification | บันทึก baseline, candidate และ checkpoints ใช้ candidate เดิมต่อโดยไม่ bump ซ้ำ ตรวจ remote SHA/fast-forward ทุก stage; divergence และ tag collision ต้องแก้จากหลักฐาน |
| Production publication | คำสั่งคือการยืนยัน; แสดง SHA, version, remote branch และ tag แล้วทำต่อ ถามเฉพาะความผิดปกติของ version หรือ candidate |
| Deployment status | branch publication ไม่พิสูจน์ Jenkins build หรือ rollout; ไม่รอ pipeline เขียวและไม่เรียก Jenkins API/remote server ภายใต้ contract นี้ |
| Recording / history | ใช้กฎ recording ของ target โดยไม่เปิด lifecycle ซ้ำ; รักษา changelog/notes เดิม รายงาน release SHA แยกจาก final develop SHA เมื่อมี audit commit |

รายละเอียดเครื่องมือและ fallback อยู่ใน [release-tools](../skills/agrimap-agent-skills/references/release-tools.md) ผล package tests ไม่ได้พิสูจน์ live Jenkins หรือทุก CLI build

## ขอบเขตการนำไปใช้กับโครงการ

### ตรวจ branch ก่อน release

ใช้โฟลเดอร์เดิมตลอดงาน ก่อนเขียน artifacts ของ release ใหม่ให้ fetch และตรวจ `develop`, `jenkins`, `jenkins-release` เทียบ remote ของแต่ละ branch ให้ครบ หาก local ตามหลังอย่างเดียวให้ pull `--ff-only` เมื่อ switch ได้ปลอดภัย ถ้า local นำอยู่ให้ตรวจ commits ก่อน ไม่ reset; ถ้า diverged ให้ตรวจ diff และวิธีรวมประวัติในที่เดิม การ pull ครบช่วยลดปัญหาจากข้อมูลเก่า แต่ไม่รับประกันว่าจะไม่มี conflict เมื่อมีคน push ใหม่

การตรวจนี้ไม่ clone project ไม่สร้าง worktree ไม่ copy ไปโฟลเดอร์ release ใหม่ และไม่ merge ข้าม branch หรือ push Production ในขั้น preflight ไฟล์ bootstrap/log ที่ Agent เพิ่งแก้เป็นงานใน scope ที่ต้องจำแนก ไม่ใช่เหตุให้เริ่มทำซ้ำในโฟลเดอร์อื่น ถ้ามี candidate ค้างให้ตรวจ resume ก่อน ห้าม pull ทับ candidate

### เริ่มจาก feature/* หรือ hotfix/*

คำสั่ง release ปัจจุบันเตรียม version บน `develop` ยังไม่มี action ที่รับผิดชอบ commit/push source branch และ merge เข้า develop ให้อัตโนมัติ การอยู่บน feature/hotfix แล้วสั่ง release ไม่ได้กำหนดว่าจะนำ commits ใดเข้า develop หรือใช้ merge strategy ใด Agent ต้องแยกให้ชัดว่า release ของ develop ที่รวมงานแล้ว หรือมีงาน source-branch integration ที่ต้องทำก่อน ห้ามสลับไป release develop จนงาน feature ที่ร้องขอตกหล่น

หากผู้ใช้สั่ง integration แยก ต้องระบุ source/target และตรวจ scope, branch protection/MR, วิธี merge และ verification ก่อน เมื่อรวมเข้า develop แล้วจึงใช้ release flow เดิมต่อ กฎ `--ff-only` ของ develop → jenkins → jenkins-release ไม่ใช่กฎ merge feature/hotfix ทุกกรณี

### Requester และ bootstrap CLI

ใช้ชื่อที่ยืนยันแล้วในบทสนทนา/session/local confirmation ก่อนถามซ้ำ `agm-workspace.mjs requester` ตรวจ local evidence แบบอ่านอย่างเดียว ส่วน `start --requested-by <confirmed-name>` รองรับการส่งชื่อที่ยืนยันในบทสนทนาโดยตรง การไม่มี runtime record ไม่ได้ลบ confirmation ในบทสนทนา ไม่ใช้ Git author คนล่าสุดแทนคนสั่งงานหรือสิทธิ์ Production

รุ่น 4.1.0 แก้ bootstrap CLI ที่เคยอ่าน `args._` จาก parser ที่ไม่คืน positional arguments แล้ว: `project-bootstrap.mjs plan|apply|upgrade` ใช้งานผ่าน CLI ได้ตามเอกสาร โดยตรวจ regression จากการเรียก executable จริง

งานใน project เดิมต้องอ่าน AGENTS.md ของ target จริงก่อนเสมอ bundled AGENTS เป็นต้นทางสำหรับติดตั้ง ไม่ใช่คำสั่งให้ทับกฎของ project โดยอัตโนมัติ

ยังไม่ได้ยืนยันความตรงกันกับ CLI template ภายนอก และ runtime ยังไม่ได้ปรับ recording ให้รองรับ portable contract ทุกข้อโดยอัตโนมัติ โดยเฉพาะ report, prompts/tasks และ log schema ต้องเลือกวิธีบันทึกให้ตรง project contract โดยไม่เปิด lifecycle ซ้ำ ห้ามอ้างว่าการตรวจ package ผ่านพิสูจน์ integration เหล่านี้แล้ว

ก่อนนำไปทับหลาย repo ให้เทียบ canonical template, project instructions และ runtime พร้อม dry-run ราย target การอัปเดต plugin ไม่ได้อนุญาตให้ migrate project documents

## Branch, version และ pipeline

| Environment | Version owner | Target branch |
| --- | --- | --- |
| Inhouse | Jenkinsfile | jenkins |
| Production | Jenkinsfile_Production | jenkins-release |

แก้ IMAGE_TAG/PROJECT_VERSION ที่ develop เท่านั้น ใช้เลข Version/Patch ที่เจ้าของระบุชัดแยกตาม environment; หากไม่ระบุจึงคำนวณ PATCH+1 จาก owner จริง และไม่เปลี่ยน pipeline behavior จาก version intent

Flow: develop → push/verify jenkins → push/verify jenkins-release โดยใช้ exact verified source SHA และ --ff-only ทีละขั้น ห้ามข้าม jenkins

**ไม่ต้องรอ pipeline เขียวก่อน promote ต่อ** jenkins gate เป็นกฎลำดับ branch ไม่ใช่ gate รอ Jenkins Agent ไม่เรียก Jenkins API ไม่ทำ rollout/remote server; trigger ตั้งฝั่ง server แยกต่างหาก

ตาม profile ใน AGENTS pipeline ทำ analysis/build/push image ไม่ใช่ server rollout จึงห้ามอนุมานว่า deploy สำเร็จ รายงาน pipeline pending/not verified เว้นแต่มีหลักฐานจริง ความสำเร็จของ mode วัดที่ remote checkpoints รวม tag/final audit ที่ร้องขอ ไม่ใช่ pipeline เขียว

## Intent สำหรับมนุษย์

ตั้งแต่ 3.2.0 คำสั่งใหม่ทั้ง 9 แบบใช้ [ขั้นตอนที่ล็อกไว้](../skills/agrimap-agent-skills/references/release-steps.md) โดย release-notes และ release.md ใช้ Production version เท่านั้น; Inhouse-only ไม่สร้าง versioned notes คำอธิบาย notes ตาม environment และ legacy intents ด้านล่างไม่ใช้แทน contract ใหม่นี้ ตั้งแต่ 3.2.1 แต่ละ stage ต้อง fetch/sync local branch กับ remote แบบ fast-forward-only แล้วประเมิน gate ใหม่ใน invocation เดิม เพื่อลด false gate จาก stale local state; remote divergence จริงยังต้องหยุดวิเคราะห์ ตรวจ [CLI compatibility](../skills/agrimap-agent-skills/references/release-tools.md) ก่อน mutation; การอัปเดต skill package ไม่ได้แก้ CLI หรือ migrate AGENTS ใน product repo

ตั้งแต่ 3.1.0 ใช้ `$agm-release` ตาม [ตารางคำสั่งใน README](../README.md#agm-release) และ [contract ของสกิล](../skills/agrimap-agent-skills/references/release-workflow.md) ได้โดยตรง คำสั่งใหม่นี้มีขอบเขตแยกจาก legacy intents ด้านล่าง: prepare เก็บ candidate ในเครื่อง, pipeline production หยุดก่อน push Production และ promote ต้องขอยืนยัน SHA/branch/tag ที่เตรียมแล้วเสมอ ไม่รับสิทธิ์อัตโนมัติจากกลุ่ม B

พิมพ์ใน Agent chat หลังระบุโครงการเป้าหมาย Agent เป็นผู้รัน agm-release และ Git เอง ไม่ส่งคู่มือให้คนไปรันต่อ

| Intent | ผลหลัก | จุดจบ |
| --- | --- | --- |
| Diff เท่านั้น / Diff + Changelog | audit/reconcile changelog และ project index | ไม่มี version/publication |
| Project Backfill | diff ทั้ง reachable history, dirty inventory, historical changelog, catalog และ README capability/API tables | coverage ครบ ไม่มี publication |
| Release Baseline | cumulative notes ของ current Production SHA ที่พิสูจน์ได้ | ไม่ bump/push/tag |
| Prepare Inhouse / Production / Both | bump owner ที่เลือกแยกกัน ตรวจผล | commit/push/verify develop เท่านั้น |
| Version Inhouse | bump Inhouse เท่านั้น | develop → jenkins + final audit develop |
| Version Both | bump owners แยกกัน | develop → jenkins → jenkins-release + final audit develop |
| Version Production | bump Production เท่านั้น; Inhouse version ไม่ขึ้น | ผ่าน jenkins ถึง Production + final audit develop |
| Version + Tags | Version Production และ annotated tag จาก Production notes | remote tag object/peeled SHA + final audit develop |

Deploy aliases และ ambiguous routing ดู AGENTS §2 ใช้ exact phrase ที่เจาะจงที่สุด การยก keyword ในคำขอแก้เอกสารไม่ใช่การอนุมัติ release

## กลุ่ม B รวมงานค้างที่ตรวจแล้ว

สี่ intent Version Inhouse / Version Both / Version Production / Version + Tags รวม staged, unstaged, untracked และ deletion ทั้ง repository ที่ตรวจแล้วตาม §6.3 ไม่จำกัดเฉพาะ release files และไม่ข้ามเพราะเป็นงานก่อนหน้า

ต้องตรวจ secrets, ignored/generated outputs, nested repos และ allowlist จัด publish/blocked ราย path ใช้ exact-path staging ไม่ git add . หรือ -A ไม่ stash ซ่อนงานและไม่ force-add ignored files

แยก content commit ของงานเดิมออกจาก version metadata commit ยังห้ามเขียน pipeline behavior/source ใหม่จาก version intent เฉย ๆ กลุ่ม A และ deploy aliases ไม่ได้รับ expanded publication scope นี้

หลัง release/tag checkpoint ทำ final audit commit/push เฉพาะ artifacts ที่ตรวจแล้วบน develop **ไม่ promote audit commit ไม่ย้าย tag และไม่ bump ซ้ำ** รายงาน release SHA กับ final develop SHA แยกกัน inventory ของ publishable changes ต้องไม่ตกหล่น

Exact group-B intent และคำสั่ง agm-release ที่ owner สั่งเองยืนยัน branch pushes รวม final audit; tag push เฉพาะ Version + Tags และ `release production|full`/`promote` ตาม §2.1 ไม่ถามซ้ำเมื่อไม่มีความผิดปกติหรือ stop condition

## หลักฐานและภาษา

- changelog.md: English entries, newest-first, หนึ่ง heading ต่อวัน; map actual diff ไม่ใช้ commit subject อย่างเดียว
- release.md และ release-notes/<VERSION>.md: prose ไทย, schema headings/fields อังกฤษ; tag annotation ต้องตรง notes จาก Production SHA
- Project Backfill ต้องมี README capability/API tables และ full-history coverage ที่พิสูจน์ได้; audit exit 0 อย่างเดียวไม่ใช่สำเร็จ
- Version + Tags ต้องตรวจ annotation equality, remote tag object และ peeled SHA; ห้ามแก้ published tag/notes ย้อนหลัง
- ทุก external command ตรวจ exit code ทันทีก่อนทำขั้นถัดไป; divergence/conflict ให้ตรวจหลักฐานและเสนอวิธีรักษาประวัติก่อนขอ decision

## Portable recording ของ repo ที่รับ contract นี้

AGENTS §9 ใช้ได้โดยไม่มี skills หรือ hooks สำหรับงานแก้ repository ต้องมี logs + current/recent memory และ terminal report; decisions/instructions/knowledge เฉพาะเมื่อเข้าเงื่อนไข ไม่สร้างไฟล์เปล่า

นี่เป็น project contract ที่เข้มกว่าค่าเริ่มต้น optional report ของ skill package ไม่เปิด lifecycle ซ้ำ และไม่เปลี่ยนกฎทุก repository โดยอัตโนมัติ อ่าน allowlist และ group-B exception ในฉบับเต็มก่อน publication

<a id="bootstrap"></a>
## Bootstrap ไม่ใช่ release

สำหรับอัปเกรด bootstrap โดยรักษากฎเฉพาะ ใช้คำสั่งนี้ในโครงการเป้าหมาย:

```text
$agm-release bootstrap upgrade
```

Agent ตรวจชนิดโครงการและ diff ก่อนใช้ normal plan/apply มี backup สำหรับไฟล์ที่ถูกเปลี่ยน ส่วน custom rules จะ merge อย่างเจาะจงและตรวจ hash/receipt หลัง review หากกฎขัดแย้งจนตัดสินไม่ได้จึงถามเฉพาะประเด็นนั้น ไม่เขียนทับ custom rules เงียบ ๆ คำสั่งเดิม `$agm-release upgrade` ยังเป็นโหมดแทนที่ contract อย่างชัดเจนพร้อม backup

ขอบเขตไฟล์คือ AGENTS.md, AGENTS.release.md, GEMINI.md, CLAUDE.md, CURSOR.md, release-notes/README.md และ managed Deployment block ใน README เท่านั้น ไม่เปลี่ยน Jenkinsfiles, product versions, changelog หรือ notes รุ่นเก่า และไม่ commit/push/tag หากต้องการอัปเดตแพ็กเกจ AGM ของ host ให้ใช้ [agm-doctor update](DOCTOR.md) แทน

ติดตั้งเมื่อ explicit init/adopt หรือเป็น prerequisite ที่ตรงขอบเขตคำสั่ง agm-release ของ product target ไม่ทำเมื่อ identify หรือเปิด session:

- Copy byte-exact: AGENTS.md, AGENTS.release.md, GEMINI.md, CLAUDE.md, CURSOR.md, release-notes/README.md
- Pointer files ชี้ AGENTS เท่านั้น ไม่คัดกฎซ้ำ
- README แทรกเฉพาะ Deployment block; ไม่ copy ทั้งไฟล์
- ไม่ copy .gitignore/Jenkinsfiles/changelog/notes ราย version ไม่ reset version หรือสร้าง branches
- Existing differing content เป็น conflict ต้องตกลง adoption ก่อน ไม่ overwrite เงียบ ๆ

ตั้งแต่ 3.2.2 Agent ตรวจและ plan/apply ไฟล์ bootstrap ที่ขาดและเข้ากันได้ก่อน audit ได้เอง แล้วตรวจซ้ำและทำคำสั่งเดิมต่อ ไม่ต้องให้ผู้ใช้เรียก init หรือ restore/commit เอง หากต้องแทนที่ไฟล์เดิมที่ขัดแย้ง ให้แสดง diff และขอยืนยัน adoption ตามจำเป็น กฎยืนยัน Production/tag ยังเหมือนเดิม; standalone pipeline/promote ไม่เพิ่มเวอร์ชันหรือเปลี่ยน candidate ที่เตรียมไว้โดยอัตโนมัติ ดู [ขอบเขตการซ่อม prerequisite](../skills/agrimap-agent-skills/references/release-and-bootstrap.md#release-prerequisite-repair)

ตัวอย่าง **Agent chat / Codex**:

```text
$agm-be
วางแผน bootstrap เอกสาร AgriMap สำหรับ [project path จริง] ชนิด be-main
แสดงไฟล์ที่จะสร้างและ conflicts โดยยังไม่ apply
ใช้ canonical AGENTS ฉบับ owner-supplied ล่าสุด
ห้ามเปลี่ยน version, Jenkinsfiles หรือทำ Git publication
```

เปลี่ยน prefix ตาม [Usage](USAGE.md) หากใช้ host อื่น Runtime preview/apply อยู่ใน [Maintaining](MAINTAINING.md#bootstrap-cli)

AGENTS ที่ส่งมาอธิบาย .NET main-service profile จึงต้องตรวจความเข้ากันได้ของ FE/libraries และ server configuration จริง ไม่สมมติว่า stage/tool/trigger เหมือนกัน ค่า scaffold ใหม่ของ main FE/BE ยังคือ 1.0.0, libraries 0.0.x; adoption ไม่เปลี่ยนเลขเดิม

## Installed contract tracking (3.4.0)

AGENTS.md ที่ติดตั้งมี `AGRIMAP BOOTSTRAP VERSION` และ receipt ที่ `.agrimap-agent/runtime/bootstrap.json` ก่อนงานเขียนใน product repo ให้ตรวจเทียบกับ manifest ของ skill รุ่นที่โหลดจริง หากเก่าหรือไม่มี marker ให้รัน bootstrap plan/apply ในคำขอเดิม ระบบอัปเดต template รุ่นเก่าที่ hash ตรงได้ พร้อม backup และรักษา README นอก managed block หากมีกฎเฉพาะโปรเจกต์ ให้รวมการเปลี่ยนแปลงแบบเจาะจงและตรวจใหม่ ไม่เขียนทับทั้งไฟล์หรือเปลี่ยน marker อย่างเดียว ไม่ต้องไล่อัปเดตทุก repo ตอนติดตั้ง plugin; ตรวจและอัปเดต repo ที่กำลังทำงานเมื่อเริ่มงานนั้น

## Indexing and Project Backfill (3.6.1)

`agm-release indexing` รวม Project Backfill ในคำสั่งเดียว: full reachable-history coverage, current capability catalog ใน project.md, historical changelog และ README capability/API inventory ตาม release-workflow.md ใช้หลักฐานที่ครบแล้วต่อและเติมเฉพาะช่องว่าง ไม่สร้างรายการซ้ำ ทั้ง standalone indexing และ I step ของ composite release ใช้กฎนี้; standalone prepare ยังคง scoped prerequisite indexing ผลลัพธ์ต้องอยู่ใน project root ถาวร ไม่จบด้วย memory ที่อยู่เฉพาะ Temp และ audit exit 0 ไม่ใช่หลักฐานว่า backfill ครบ
