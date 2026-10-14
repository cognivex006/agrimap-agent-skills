# กติกา Release, Version, Changelog และ Deployment

<!-- AGRIMAP BOOTSTRAP VERSION: 4.11.0 -->

ไฟล์นี้ใช้ร่วมกับ `AGENTS.md` (core) ของ repository เดียวกัน: เก็บ §2 Intent routing ฉบับเต็มและ §4–§8 โดยคงเลข § เดิม เพื่อให้การอ้างอิงข้ามไฟล์ไม่เปลี่ยน §1, §3, §9 และ §10 อยู่ใน `AGENTS.md` และยังบังคับใช้กับงาน release ทุกงาน

## 2. Intent routing

| Mode | Trigger | การทำงาน | สิ่งที่ห้าม |
| --- | --- | --- | --- |
| `develop-complete` | feature/fix/refactor/docs/config/pipeline เสร็จ รวมงานที่ commit แล้ว | audit committed + staged + unstaged + untracked, เติม changelog, update project index | version, push protected branch, merge, deploy หากไม่ได้สั่ง; commit/push work branch ทำตาม §10 |
| `diff-only` | `Diff เท่านั้น`, `Diff + Changelog`, `อัปเดต Changelog เท่านั้น` | audit/reconcile changelog/index | version/commit/push/merge/tag/release |
| `project-backfill` | `Project Backfill`, `Bootstrap Project Memory`, `สรุปประวัติโครงการ`, `อัปเดต Project Memory + Changelog` | Diff ก่อน แล้วเติม historical changelog ที่ขาด, project catalog และ README capability tables จาก source/tests/docs และ reachable Git history ทั้งโครงการ | เดาจาก commit subject อย่างเดียว, เขียนทุก commit ลง changelog, version/commit/push/deploy หากไม่ได้สั่งเพิ่ม |
| `inhouse` | `Deploy/เตรียม/ดีพลอย Inhouse`, `Deploy/เตรียม/ดีพลอย Inh`, `Deploy Jenkins` | prepare Inhouse, push develop, promote jenkins | แตะ Production version/tag |
| `production` | `Deploy/เตรียม/ดีพลอย Production`, `Deploy/เตรียม/ดีพลอย Prod`, `Deploy Jenkins-release` | prepare Production แล้ว promote develop -> jenkins -> jenkins-release | ใช้ Inhouse version เป็น Production version, tag |
| `both` | `Deploy/เตรียม/ดีพลอย Both/All`, `Inhouse และ Production`, ระบุสอง environment | prepare ทั้งสองที่ develop โดยคำนวณแยก แล้ว promote develop -> jenkins -> jenkins-release | บังคับสอง version ให้เท่ากัน, tag |
| `release-baseline` | `Release Baseline`, `Release Notes ครั้งแรก`, `สร้าง Release Notes ก้อนแรก` | สร้าง `release-notes/<CURRENT>.md` ของ Production version ปัจจุบันแบบ cumulative ตาม §5.1 | bump version, commit/push/merge, tag, deploy |
| `prepare-inhouse` | `Prepare Inhouse`, `เตรียมเวอร์ชัน Inhouse`, `ขึ้นเวอร์ชัน Inhouse ไม่ promote` | bump `Jenkinsfile` +0.0.1 ที่ `develop`, เติม changelog, verify, commit/push `develop` แล้วหยุด | promote branch, tag, แตะ `Jenkinsfile_Production` |
| `prepare-production` | `Prepare Production`, `เตรียมเวอร์ชัน Production`, `ขึ้นเวอร์ชัน Production ไม่ promote` | bump `Jenkinsfile_Production` +0.0.1 ที่ `develop`, เติม changelog/notes, verify, commit/push `develop` แล้วหยุด | promote branch, tag, แตะ `Jenkinsfile` |
| `prepare-both` | `Prepare Both`, `เตรียมเวอร์ชันทั้งสอง`, `ขึ้นเวอร์ชันทั้งสองไม่ promote` | bump ทั้งสอง owner file โดยคำนวณแยกที่ `develop`, verify, commit/push `develop` แล้วหยุด | promote branch, tag, บังคับสอง version ให้เท่ากัน |
| `version-inhouse` | `Version Inhouse`, `เวอร์ชัน Inhouse`, `ขึ้นเวอร์ชัน Inhouse` | bump `Jenkinsfile` +0.0.1 ที่ `develop`, เติม changelog, verify, commit/push `develop` แล้ว promote `develop -> jenkins` จบ | แตะ `Jenkinsfile_Production`, promote `jenkins-release`, tag |
| `version-both` | `Version Both`, `Version Inhouse และ Production`, `ขึ้นเวอร์ชันทั้งสอง` | bump ทั้ง `Jenkinsfile` และ `Jenkinsfile_Production` โดยคำนวณแยกที่ `develop` แล้ว promote `develop -> jenkins -> jenkins-release` ครบสามขั้น | บังคับสอง version ให้เท่ากัน, ข้ามขั้น `jenkins`, tag |
| `version-only` | `Version Production`, `เวอร์ชันอย่างเดียว`, `ขึ้นเวอร์ชันไม่เอา Tag` | Production: prepare, เติม changelog/notes, verify, commit/push `develop` แล้ว promote `develop -> jenkins -> jenkins-release` ครบสามขั้นตาม §6.2 | tag, merge `develop -> jenkins-release` ตรง |
| `version-with-tags` | `Version + Tags`, `Version พร้อม Tag`, `ขึ้นเวอร์ชันพร้อม Tag` | ทำ `version-only` ให้ครบก่อน แล้วสร้าง annotated tag `v<VERSION>` โดยใช้ `release-notes/<VERSION>.md` จาก Production SHA เป็น description และ push tag ตาม §7 | ข้ามขั้น `jenkins`, tag ก่อน push `jenkins-release` สำเร็จ |
| `integrate` | `merge`, `รวม`, `รวมเข้า <branch>`, `pr`, `เปิด PR`, เลขตัวเลือกจาก Next-step card | ทำตาม §10.4 กับ work branch ปัจจุบัน | promote `jenkins`/`jenkins-release`, tag, force push |
| `ambiguous` | `นำขึ้น Jenkins` ไม่มี qualifier | ถาม `Inhouse`, `Production` หรือ `Both` | mutation ทุกชนิดก่อนตอบ |

Normalize ได้เฉพาะ case/whitespace และ semantic phrase boundary ห้ามจับ substring สั้นในคำอื่น เลือก exact phrase ที่เฉพาะเจาะจงที่สุดก่อน: `Prepare Both` -> `prepare-both`, `Version Both`/`Version Inhouse และ Production` -> `version-both`; ใช้ `both` เฉพาะ deploy สอง environment ที่ไม่ตรง phrase เหล่านี้ ถ้ายังขัดกันให้ถามก่อน mutation การยก keyword เป็นตัวอย่างในคำขอตรวจ/แก้เอกสารไม่ใช่คำสั่ง release

### 2.1 Agent เป็นผู้รันคำสั่ง ไม่ใช่มนุษย์

- มนุษย์พิมพ์เฉพาะ intent keyword เช่น `Project Backfill`, `Release Baseline`, `Version Production`, `Version + Tags` เท่านั้น ห้าม Agent ตอบกลับด้วยการให้มนุษย์ไปรัน `agm-release` หรือ Git เอง
- Agent ต้องรัน `agm-release` และ Git command ตามลำดับใน §6/§7 ด้วยตนเอง อ่านผลจริง แล้วสรุปให้มนุษย์เป็นภาษาที่อ่านเข้าใจได้ พร้อมสถานะต่อขั้น
- Agent หยุดขอ owner decision เฉพาะเมื่อชน stop condition จริง เช่น divergence, conflict, verification fail, tag collision, missing permission หรือ path นอก write allowlist ไม่ใช่หยุดเพราะเลี่ยงการรันคำสั่ง
- **คำสั่งของ owner คือการยืนยัน (owner decision 2026-10-14):** intent กลุ่ม B และคำสั่ง agm-release (`release full|production|inhouse`, `pipeline`, `promote` รวม `--flash`) ที่ owner พิมพ์เอง ยืนยัน `git push` branch, `jenkins-release`, annotated tag และการแจ้งเตือนครบทั้ง flow ห้ามถามก่อน push Inhouse, ก่อน Production หรือก่อน tag; ถามหนึ่งครั้งก่อน push แรกเฉพาะเมื่อผิดปกติ: (1) owner ระบุเลข version ที่ไม่ใช่ PATCH+1 ของ baseline เช่น baseline 1.0.3 แต่สั่ง `version 1.0.5` หรือเลขต่ำกว่า/เท่ากับที่ publish แล้ว (2) มีเนื้อหาที่ run นี้ไม่ได้เตรียมเข้ามาใน candidate หรือปลายทาง/tag เปลี่ยนจากแผน; คำสั่งเปล่าที่ใช้เลข PATCH+1 ไม่ใช่ความผิดปกติ stop condition ไม่ใช่คำถาม ให้หยุดเฉพาะขั้นนั้นพร้อมหลักฐาน; กฎใน `PROJECT CUSTOM` ที่บังคับให้ยืนยันยังมีผล
- Final report ต้องระบุคำสั่งที่รันจริงและผลจริงทุกขั้น ห้ามเขียนเป็นคู่มือให้ไปทำต่อเอง
- ทุก external command ต้องตรวจ exit code ทันที; ใน PowerShell ตรวจ `$LASTEXITCODE` ก่อนคำสั่งถัดไป ห้ามให้ผลสำเร็จของคำสั่งท้ายกลบ failure ก่อนหน้า หากมีขั้นที่จำเป็นเหลือและไม่ชน stop condition ให้ทำต่อใน run เดิมจนถึง terminal checkpoint ตาม §8.1

### 2.2 สรุป intent keyword สำหรับมนุษย์

งานเอกสาร ไม่แตะ version และไม่ทำให้ pipeline ทำงาน

| พิมพ์ว่า | ได้อะไร |
| --- | --- |
| `Project Backfill` | Diff/reconcile ประวัติที่ขาด + historical `changelog.md` แบบ DESC + project catalog + README capability/API tables |
| `Release Baseline` | `release-notes/<CURRENT>.md` ก้อนแรกแบบรวมทุก capability |

งานที่ขึ้นเลข version มี 7 แบบ แบ่งเป็นสองกลุ่มตามว่า Agent promote branch ต่อให้หรือไม่

**กลุ่ม A — ไม่ promote ไม่เกิด pipeline (flow เก่า)** Agent bump version, เติม changelog/notes, verify, commit และ push `develop` แล้วหยุด คนไป promote branch เองภายหลัง

| พิมพ์ว่า | branch flow | owner file ที่ +0.0.1 | tag |
| --- | --- | --- | --- |
| `Prepare Inhouse` | `develop` เท่านั้น | `Jenkinsfile` | ไม่ |
| `Prepare Production` | `develop` เท่านั้น | `Jenkinsfile_Production` | ไม่ |
| `Prepare Both` | `develop` เท่านั้น | `Jenkinsfile` และ `Jenkinsfile_Production` คำนวณแยกกัน | ไม่ |

**กลุ่ม B — promote ให้ครบ ซึ่งทำให้ Jenkins pipeline ทำงาน** แบ่งตาม branch flow และ owner file ได้ 3 กรณี โดยสองแถวล่างเป็นกรณีเดียวกัน ต่างกันแค่ทำ tag หรือไม่

| พิมพ์ว่า | branch flow | owner file ที่ +0.0.1 | tag |
| --- | --- | --- | --- |
| `Version Inhouse` | `develop -> jenkins` จบ | `Jenkinsfile` เท่านั้น | ไม่ |
| `Version Both` | `develop -> jenkins -> jenkins-release` | `Jenkinsfile` และ `Jenkinsfile_Production` คำนวณแยกกัน เลขอาจไม่เท่ากัน | ไม่ |
| `Version Production` | `develop -> jenkins -> jenkins-release` | `Jenkinsfile_Production` เท่านั้น (`jenkins` ไหลผ่านโดยไม่ขึ้นเลข Inhouse) | ไม่ |
| `Version + Tags` | `develop -> jenkins -> jenkins-release` | `Jenkinsfile_Production` เท่านั้น | สร้างและ push annotated tag โดยใช้ Production release notes เป็น description |

- **`Version + Tags` เป็นแบบเดียวในกลุ่ม keyword ที่สร้าง tag** แบบอื่นทั้งหมดรายงาน tag เป็น `not requested`
- **คำสั่ง agm-release `release production`, `release full` และ `promote` เทียบเท่า `Version + Tags` เสมอ:** ต้องสร้างและ push annotated tag ตาม §7 และส่ง Release Description ตาม §8.2 ไม่ใช่ intent `production`/`both` ที่ไม่มี tag; `release inhouse`, `pipeline`, `prepare` ไม่มี tag
- ทั้ง 7 แบบ **แก้เลข version ที่ `develop` เท่านั้น** แล้ว commit/push `develop` ก่อน จากนั้น promote ด้วย `--ff-only` ให้เลขเดินทางไปกับ merge ห้ามไปแก้ `Jenkinsfile` หรือ `Jenkinsfile_Production` บน branch `jenkins` หรือ `jenkins-release` โดยตรง
- กลุ่ม A จบที่ push `develop` สำเร็จ ต้องรายงาน branch promotion และ pipeline เป็น `not requested` และแจ้ง exact verified develop SHA ให้คนเอาไป promote ต่อ ห้าม promote เองแม้จะเห็นว่า branch ตามหลังอยู่
- กลุ่ม B ทุกแบบที่ไปถึง `jenkins-release` ต้องผ่าน `jenkins` ก่อนเสมอตาม §6.2 แม้กรณี `Version Production` ที่ไม่ขึ้นเลข Inhouse ก็ยังต้อง promote `jenkins` ให้ทันก่อน
- Agent จบที่ remote checkpoint ของ mode ตาม §8.1 รวม tag เมื่อขอ ไม่ได้ deploy เอง และรายงาน pipeline เป็น `pending` เว้นแต่ตรวจได้จริง

### 2.3 กลุ่ม B รวมงานค้างทั้งหมด

- `Version Inhouse`, `Version Both`, `Version Production` และ `Version + Tags` รวมการตรวจและ commit/push staged, unstaged, untracked และการลบไฟล์ทั้งหมดใน repository ตาม §6.3 โดยอัตโนมัติ ไม่จำกัดเฉพาะไฟล์ version/release
- Exact intent กลุ่ม B ที่ owner สั่งเองเป็นการยืนยัน branch push ตลอด flow รวม final audit commit; tag push อนุญาตเฉพาะ `Version + Tags` ไม่ถามย้ำในแต่ละ checkpoint
- การอ้าง keyword ในคำขอแก้เอกสารไม่ใช่คำสั่ง release; กลุ่ม A และ deploy aliases อื่นคงขอบเขตเดิม
- คำสั่ง publish อื่นที่ไม่ใช่กลุ่ม B (เช่น `release inhouse|production|full`, `pipeline inhouse|production`) รวมงานค้างทั้งหมดโดยอัตโนมัติเหมือนกลุ่ม B: dirty path และ local `develop` commit ที่ยังไม่ขึ้น remote นอก candidate ถูกรวมเป็น content commit ตาม §6.3 ก่อน version commit โดยไม่ถาม เก็บไว้ local เฉพาะเมื่อ owner สั่งยกเว้นชัดเจน ข้อมูลลับ ignored/runtime state และ nested repository ถูกตัดออกอัตโนมัติพร้อมรายงาน
- ทุกคำสั่ง prepare/pipeline/release เริ่มด้วย `release preflight` ตาม §6.5; sync `origin/develop`, back-merge `jenkins`/`jenkins-release` และแก้ conflict ทำเองโดยไม่ถาม branch ของคนอื่นไม่เกี่ยว
- ทุกคำสั่ง prepare/pipeline/release และกลุ่ม B รวม work branch ที่ทำเสร็จแต่ยังไม่อยู่ใน `develop` เข้า local `develop` ก่อนเตรียม version ตาม §6.4 (M) ส่วน promote รวมเข้า `develop` ตอนจบโดยไม่แตะ candidate Production ที่ freeze แล้ว
- เมื่อจบ release ให้ commit audit ที่เหลือและ push `develop` หนึ่งครั้ง แล้วตรวจ remote SHA ให้ `develop` สะอาดและเท่ากับ origin (ไม่ promote audit commit ไป `jenkins`/`jenkins-release` และไม่ย้าย tag)

## 4. Shared CLI commands

ทุกคนใช้คำสั่งเดียวกันได้ด้วย .NET 8 Global Tool package `AgriMap.ProjectDevKit.NetCore.Release` โดยติดตั้ง/อัปเดตตาม README ของ repository กลาง `agrimap.projectdevkit.netcore.release` ก่อนใช้งาน:

```text
agm-release -- audit --mode diff-only
agm-release -- audit --mode develop-complete
agm-release -- prepare --mode inhouse
agm-release -- prepare --mode production
agm-release -- prepare --mode both
agm-release -- verify --mode inhouse
agm-release -- verify --mode production
agm-release -- verify --mode both
agm-release -- notes --mode production
```

- ตรวจ installation ด้วย `dotnet tool list --global` และ `where agm-release` (Windows) หรือ `command -v agm-release` (Linux/macOS)
- Canonical source: `https://gitlab.gisc.cdg.co.th/e26-5002.agrimap/standards/tools/cli/netcore/agrimap.projectdevkit.netcore.release.git`
- Project นี้ไม่เก็บ source/test/project reference ของ CLI; หาก command ไม่มีให้หยุดและติดตั้งจาก canonical source ห้ามสร้าง local copy

- `audit` read-only และแสดง branch/HEAD/upstream/status/diffs/baseline/commits พร้อม committer date/changed paths
- `audit` exit 0 หมายถึงรวบรวมหลักฐานสำเร็จเท่านั้น ไม่ได้เติม changelog หรือรับรอง coverage; `verify` ไม่ได้ push branch/tag และ lifecycle validation ไม่ได้พิสูจน์ว่า Project Backfill หรือ release เสร็จ ต้องผ่าน §5 และ §8.1 แยกกัน
- `prepare` pre-validate owner files, เลือกเลขตามคำขอเจ้าของหรือคำนวณ PATCH แยกเมื่อไม่ระบุ, เขียนแบบ atomic ต่อไฟล์ และสร้าง/รวม notes/index skeleton; ไม่ commit/push/merge/tag/deploy
- Rerun ก่อน completed checkpoint ต้อง resume candidate เดิมจาก notes+`.agrimap-agent/memory/project.md` ไม่เพิ่ม PATCH ซ้ำ
- `verify` read-only ตรวจ exact single version pair, fixed mapping, changelog/release/notes consistency เมื่อ release intent active และคืน non-zero เมื่อ gate ไม่ผ่าน
- `notes --mode production` ใช้ current version จาก `Jenkinsfile_Production` เท่านั้น ไม่มี arbitrary filename/version
- Skeleton มี `TODO`; Agent ต้องเติมหลักฐานจริงและ `verify` ต้อง reject `TODO/TBD` ที่เหลือ
- `--format json` ใช้เมื่อผู้เรียกต้องการ machine-readable output; ห้าม output token/secret

## 5. Diff, changelog และ release artifacts

- ทุก mode ยกเว้น ambiguous ต้องตรวจ staged/unstaged/untracked และ reachable commit range จาก baseline ที่พิสูจน์ได้ ห้ามรวม commit จาก branch อื่นเพียงเพราะอยู่ใน `--all`
- Map ทุก change ที่เปลี่ยน behavior ของ application, build, CI/CD, config, dependency, security หรือ release governance ไป changelog entry พร้อมหลักฐานใน report; ใช้ `docs` สำหรับการแก้กติกา/เอกสาร และ `fix|feature|refactor` ตามผลจริงของ code/config
- ห้ามยกเว้นทั้งไฟล์หรือทั้ง commit เพียงเพราะชื่อเป็น `Jenkinsfile*`, workflow, chore, revert หรือมี version pair อยู่ด้วย การเพิ่ม/ลบ/ปิด stage หรือเปลี่ยน command/gate เป็น operational behavior และต้องมี changelog แม้ owner เป็นผู้แก้และ commit เอง; สิทธิ์บันทึก change ไม่ได้ให้สิทธิ์แก้ pipeline นั้น
- ยกเว้นได้เฉพาะ hunk ที่พิสูจน์ว่าเป็น merge-only ที่ไม่มีผลใหม่, version metadata ล้วน, formatting/generated noise หรือ raw prompt/audit/lifecycle records; report ต้องมี path/range และเหตุผลต่อกลุ่ม ห้ามใช้คำว่า workflow noise ครอบคลุม executable workflow หรือกติกาที่เปลี่ยนจริง
- Coverage แยกเป็น committed range, staged, unstaged และ untracked: อ่าน actual diff รวมการลบ/revert ไม่ใช้ commit subject อย่างเดียว; ถ้า baseline ไม่ครอบคลุม commit ที่ owner ชี้ ให้ขยายช่วงถึง commit นั้นและระบุเหตุผล ห้ามใช้ latest tag ตัดงานตกหล่นที่กำลังตรวจ
- Report ต้องมี mapping `commit/path/hunk -> changelog date + entry` หรือ exclusion พร้อมเหตุผล และจำนวน covered/excluded/unresolved; `unresolved > 0` ในขอบเขตที่ร้องขอห้ามรายงาน coverage completed หาก Jenkins change ยัง uncommitted ให้บันทึกเป็น working-copy ตามวันที่ทำงานและ reconcile อีกครั้งเมื่อ commit โดยไม่เพิ่ม semantic duplicate
- `changelog.md` เขียน **ภาษาอังกฤษล้วนทุก entry ห้ามใช้ภาษาไทย** ต่างจาก release notes กับ tag annotation ใน §5.2 ที่ใช้ไทยเป็นหลัก เพราะ changelog เป็น input ให้ tooling และ diff review ที่ต้อง grep เทียบกับ code ตรง ๆ
- `changelog.md` ใช้หนึ่ง section ต่อวัน เรียง **newest-first** (วันใหม่สุดบนสุด วันเก่าสุดล่างสุด เหมือน `release.md`) และ deduplicate:

  ```markdown
  # YYYY-MM-DD
  - feature <what the user or caller can now do>
  - fix <what was broken and what happens now>
  - refactor <what moved, behavior unchanged>
  - docs <which document changed>
  ```

- Entry format คือ `- <kind> <English sentence>` โดย `kind` เป็น `feature|fix|refactor|docs` ตัวพิมพ์เล็ก หนึ่งบรรทัดต่อหนึ่ง change ไม่ใส่ trailing period, commit SHA, ticket id หรือชื่อคน; ใช้ backtick ครอบ identifier/route/path
- **Fast path เป็นวิธีแก้ไฟล์ ไม่ใช่เกณฑ์จบ audit**: เริ่มด้วย `head -n 12 changelog.md` หรือ PowerShell `Get-Content changelog.md -TotalCount 12`; ถ้าไฟล์ไม่มีให้สร้าง canonical `changelog.md` จาก change ที่พิสูจน์ได้
  1. ค้น date heading และ identifier ที่เกี่ยวข้องด้วย `rg -n` แล้วอ่าน section เป้าหมายให้ครบเพื่อ deduplicate; 12 บรรทัดแรกไม่พอเมื่อ section ยาวหรือกำลังเติมย้อนหลัง
  2. เติม bullet ใน section ของวันที่พิสูจน์ได้; ถ้าไม่มี section ให้แทรกตำแหน่ง newest-first ที่ถูกต้อง ใช้ committer date สำหรับ committed change และวันที่ทำงานสำหรับ uncommitted change ห้ามย้ายประวัติเก่ามาเป็นวันนี้
  3. อ่าน section ที่แก้ซ้ำและตรวจ `git diff -- changelog.md` กับ `git diff --check`; ห้ามสร้างวันที่ซ้ำหรือ rewrite ส่วนที่ไม่เกี่ยวข้อง
- `project-backfill` อ่าน changelog ทั้งไฟล์และตรวจทุก date/entry ได้; mode อื่นอ่านเฉพาะ heading/section/entry ที่จำเป็นต่อ coverage ได้โดยไม่ต้องอ่านหรือ rewrite ทั้งไฟล์
- รายการย้อนหลังใช้ committer date; งาน uncommitted ใช้วันที่ทำงาน ห้ามแต่ง capability จากข้อความคลุมเครือ
- First adoption สรุป stable capabilities จาก code/docs/tests/reachable history แยก FACT/UNKNOWN; subsequent release บันทึกเฉพาะ exact delta หลัง baseline production tag
- Release baseline ต้องเป็น Production tag ที่พิสูจน์จาก version owner/notes ที่ tagged SHA และ reachable จาก candidate ไม่ใช่เลือก tag ใดก็ได้หรือเลขสูงสุดอย่างเดียว; การลบ notes ใน working tree ไม่ทำให้ published release กลับเป็น first-adoption หากหลักฐาน baseline ขัดกันให้หยุด release แต่ยังรายงานข้อค้นพบของ audit ได้
- คำสั่งต่อ Agent สำหรับทำ historical first-adoption/backfill คือ `Project Backfill` หรือ `agm-release indexing` (เป็น intent keyword ไม่ใช่ shell command) และทุก Agent ต้องทำตามขั้นตอนนี้:
  1. รัน `agm-release -- audit --mode diff-only --format json` แล้วอ่าน `git log HEAD --reverse --format="%H|%cI|%s" --name-status` ทั้ง history ที่ reachable จาก branch ปัจจุบัน ไม่จำกัดแค่หลัง latest tag; ตรวจ `git rev-parse --is-shallow-repository` หาก history ไม่ครบให้ระบุ missing coverage และอย่าอ้าง full backfill
  2. อ่าน source, public routes/contracts, tests และ docs ทั้ง project; ใช้ commit subject เป็นเบาะแสเท่านั้นและยืนยัน capability ด้วย diff/path ปัจจุบัน
  3. เพิ่ม/ปรับ `## Capability catalog` ใน `.agrimap-agent/memory/project.md` โดยหนึ่งบรรทัดต่อ stable capability พร้อม `first proven date`, commit/path evidence และสถานะ current/deprecated/unknown
  4. Backfill `changelog.md` ด้วย committer date ของ implementation ที่พิสูจน์ได้ รวม related commits เป็นหนึ่ง capability milestone เป้าหมาย 1-5 รายการต่อวัน; ถ้าเกินให้รวมระดับ module ห้ามทำ commit-by-commit dump
  5. ไม่ลง merge-only, version-only, formatting, generated files, prompt/audit logs หรือ refactor ที่ไม่เปลี่ยน behavior; operational pipeline/config/governance changes ยังต้องลงตาม §5 แม้ไม่เพิ่ม application capability วันที่หรือ capability ที่พิสูจน์ไม่ได้ให้บันทึก `UNKNOWN` ใน project memory และไม่แต่ง changelog
  6. Preserve existing entries, deduplicate semantic duplicates, เรียงวันที่ใหม่ไปเก่าแบบ newest-first และจบด้วย `git diff --check` พร้อม coverage summary ของทั้ง reachable history และ dirty inventory
  7. ก่อน complete ต้องมี evidence inventory ของ source/routes/contracts/tests/docs รวม build/CI/config, history boundary/count และ mapping ของ capability/operational milestones ไป changelog หรือ exclusion; ระบุสิ่งที่อ่านไม่ครบ ถ้าไม่มี entry ใหม่ต้องพิสูจน์ semantic coverage ของ change ที่พบ ไม่ใช่เพียงอ้าง catalog เดิม, latest tag, จำนวนไฟล์ หรือ lifecycle validation ผ่าน
- **Project Backfill ต้อง Diff ก่อนทุกครั้ง แล้วเลือกวิธีเติมตาม coverage จริง**:
  - อ่าน `changelog.md` ทั้งไฟล์และเทียบ actual committed diff ตั้งแต่ root commit ที่ reachable ถึง `HEAD` พร้อม staged/unstaged/untracked ก่อนเขียน; baseline tag ที่ `audit` คืนเป็นเพียง release delta ไม่ใช่ขอบเขต historical backfill
  - ถ้าไฟล์ไม่มี, ว่าง, มีแต่วันนี้ หรือมีประวัติเพียงบางส่วน ต้องสร้าง/เติม milestone ย้อนหลังทุกช่วงที่ยังขาดจน mapping ครบ รวม application, build, CI, config, dependency และ governance; การมีไฟล์หรือ catalog เดิมไม่ใช่หลักฐานว่าประวัติครบ
  - ถ้ามีประวัติครบแล้ว ให้ preserve รายการเดิมและเติมเฉพาะ semantic diff ที่ยังไม่มี พร้อม reconcile รายการที่ผิดจากหลักฐาน; ไม่สร้าง bullet ซ้ำ ไม่ย้ายประวัติมารวมวันนี้ และไม่ rewrite ทั้งไฟล์โดยไม่จำเป็น
  - ใช้ committer date ของแต่ละ milestone, หนึ่ง heading ต่อวัน, เรียง DESC (`newest-first`) และ English entries ตาม §5; งานเอกสารที่แก้วันนี้บันทึกวันนี้แยกจาก implementation ย้อนหลัง
  - ก่อนจบต้องตรวจ unique date headings, DESC, English entry format, semantic deduplication และ mapping `commit/path/hunk -> date + entry` พร้อม covered/excluded/unresolved; ถ้า history เก่ามี behavior ที่พิสูจน์ได้แต่ changelog มีแค่วันนี้ หรือ unresolved ยังมากกว่า 0 ห้าม complete
- **README เป็น deliverable ของ Project Backfill**: เติม overview, ตารางความสามารถครบทุก module ที่ให้บริการจริง, API/contract inventory, runtime/dependencies, setup/run/test, configuration, limitations และลิงก์เอกสารที่เกี่ยวข้อง โดย preserve ส่วนที่ถูกต้องแล้ว
  - ตารางความสามารถต้องมีอย่างน้อย `หมวด | ความสามารถ/ผลที่ผู้ใช้ได้รับ | API หรือ source evidence | ข้อจำกัด` และเทียบทุก current capability ใน project catalog รวมงาน operations; ห้ามแทนตารางด้วยคำว่า CRUD หรือชื่อ module สั้น ๆ
  - API inventory ต้องเทียบ method/route กับ controller ปัจจุบัน รวม config, source, template, widget, query, extent, cache และ health; DTO ที่มีแต่ไม่มี implementation หรือ route ที่ถูกลบต้องไม่อ้างว่าใช้งานได้
  - ถ้า owner ให้ตัวอย่าง ให้ทำ section/table parity checklist ของตัวอย่างกับ README จริง เติมทุกส่วนที่ใช้ได้กับโครงการนี้ และระบุส่วนที่ไม่เกี่ยวข้องพร้อมเหตุผล; ห้ามอ้างว่าเท่าตัวอย่างโดยยังไม่ได้อ่านตัวอย่าง
  - README อธิบายความสามารถปัจจุบัน, changelog เก็บลำดับการเปลี่ยนแปลง, project memory เก็บหลักฐาน/index และ `AGENTS.md` เป็นเจ้าของกติกาเพียงแห่งเดียว; ไม่คัดลอก workflow rules ทั้งชุดไป README
- `release-notes/<VERSION>.md` เป็น single-version payload มี version/date/source baseline/source candidate/deployment targets/Added/Changed/Fixed/Verification และไม่มี `v` ในชื่อไฟล์
- `release.md` เป็น cumulative newest-first และ section `## v<VERSION>` ต้อง link notes file ที่ตรงกัน

### 5.1 Baseline release เทียบกับ delta release

กติกานี้บังคับกับทุก Agent เพื่อให้เข้าใจตรงกัน ห้ามเขียน notes ก้อนแรกเป็น diff ของรุ่นเดียว

- **Baseline release** คือ release แรกที่ยังไม่มี published Production baseline ที่พิสูจน์ได้ตาม §5; ใช้ `first-adoption` หลังตรวจ remote/reachable history แล้วเท่านั้น การไม่มี notes ใน working tree หรือ field เดิมเขียน `first-adoption` ไม่พอจะยืนยันว่าเป็น baseline
  - `## Added` ต้องเป็น **cumulative capability inventory ทั้งหมดที่ให้บริการอยู่จริง ณ เวอร์ชันนั้น** ไม่ใช่เฉพาะสิ่งที่เพิ่มในรุ่นนั้น จัดกลุ่มตาม area เช่น authorization server, login form, external identity provider, registration, PIN, token, anonymous session, logging, operations, regression coverage, runtime
  - `## Changed` บันทึก delta สุดท้ายก่อนปิด baseline คือช่วงจาก version ก่อนหน้าถึงเวอร์ชันนี้ พร้อมระบุ commit ที่พิสูจน์ได้
  - `## Fixed` ถ้าไม่มีสิ่งที่พิสูจน์ได้ในหน้าต่างนั้นให้เขียนตรง ๆ ว่าไม่มี และชี้ไป `changelog.md` สำหรับประวัติก่อน baseline ห้ามแต่งรายการขึ้นมาให้ดูครบ
- **Delta release** คือ release ถัดจาก baseline ทุกครั้ง `## Added`/`## Changed`/`## Fixed` บันทึกเฉพาะ exact delta หลัง baseline production tag ล่าสุด ห้ามลอก inventory เดิมซ้ำ
- Capability inventory ต้องพิสูจน์จาก **tree ของ deployment SHA จริง** เช่น `git ls-tree -r --name-only <production-sha> -- <paths>` ห้ามใช้ `develop` หรือ `## Capability catalog` ปัจจุบันแทน เพราะงานที่ merge หลัง promote จะไม่ได้อยู่ในเวอร์ชันนั้น
- ทุกรายการใน inventory ต้องมี route, path หรือ symbol ที่ยืนยันได้ที่ SHA นั้น สิ่งที่พิสูจน์ไม่ได้บันทึก `UNKNOWN` ใน `.agrimap-agent/memory/project.md` ไม่ใช่ใน notes

### 5.2 ภาษาใน release notes และ tag annotation

ผู้อ่านหลักของ release tag คือทีมและผู้ดูแลระบบภายใน เนื้อความจึงต้องอ่านรู้เรื่องทันทีโดยไม่ต้องแปล

- กติกาภาษาไทยในหัวข้อนี้ **ไม่ครอบคลุม `changelog.md`** ซึ่งเป็นภาษาอังกฤษล้วนตาม §5 ห้ามแปล changelog เป็นไทยและห้ามคัดลอกประโยคไทยจาก release notes ลง changelog
- `release-notes/<VERSION>.md`, ข้อความ annotation ของ Git tag และ section ใน `release.md` ใช้ **ภาษาไทยเป็นภาษาหลัก** ทุกประโยคบรรยาย
- English ใช้ได้ตามปกติโดยไม่ต้องแปลและไม่ต้องใส่วงเล็บอธิบาย สำหรับ:
  - identifier ทุกชนิด เช่น function, method, variable, class, property, file path, route, branch, tag, version, environment name ตัวอย่าง `OAuthUseCase`, `GET /api/oauth/authorize`, `Jenkinsfile_Production`, `v1.0.16`
  - code block, shell command, config key, SQL object, package name, error code และ HTTP status ตัวอย่าง `401`, `invalid_grant`, `AgriMap.Platform 0.0.208`
  - คำทับศัพท์ทางเทคนิคที่ทีมใช้จริง เช่น deploy, pipeline, commit, merge, promote, tag, release, endpoint, token, session, cache, rollback, header และชื่อที่ทีมรู้จัก เช่น `x-correlation-id` ให้เขียนตรงตัว ไม่แปลเป็นคำไทยกว้าง ๆ เช่น "ปรับเพิ่มการส่งรหัส x-correlation-id ใน header เพื่อให้ทีมงานตรวจสอบและประสานงานแก้ปัญหาได้ตรงจุด" เข้าใจง่ายกว่า "เพิ่มรหัสติดตามคำขอที่ส่งผ่าน Gateway"
- ห้ามแปล identifier เป็นไทย และห้ามบังคับสร้างคำไทยแทนคำทับศัพท์ที่ทีมใช้จนคุ้น เพราะจะ grep เทียบกับ code ไม่เจอและสื่อสารกันไม่ตรง
- ประโยคต้องอ่านเป็นภาษาไทยที่มี term อังกฤษแทรกอยู่ ไม่ใช่ประโยคอังกฤษที่แทรกคำไทย ถ้าย่อหน้าไหนเป็นอังกฤษล้วนให้เขียนใหม่เป็นไทย
- หัวข้อและ field ตาม schema ใน `release-notes/README.md` คงเป็นอังกฤษเสมอ ห้ามแปล ได้แก่ `## Deployment targets`, `## Added`, `## Changed`, `## Fixed`, `## Verification` และ field `Version`, `Date`, `Source baseline`, `Source candidate`, `Tag` เพราะเป็นโครงสร้างที่เครื่องมืออ่าน
- กติกานี้บังคับกับ release ที่ยังไม่ได้ push tag เท่านั้น สำหรับเวอร์ชันที่ push tag ไปแล้ว **ห้ามแก้ notes ให้ต่างจาก annotation ที่เผยแพร่ไปแล้ว** ตาม §7 ถ้าต้องการปรับภาษาย้อนหลังให้บันทึกเป็น correction ใหม่แทนการแก้ของเดิม

## 6. Version และ ordered promotion

### 6.1 คำว่า deploy ในเอกสารนี้หมายถึงอะไร

- **Agent ไม่เคย deploy ด้วยตัวเอง** ไม่ remote ไป server ไม่เรียก Jenkins API ไม่รัน `kubectl`, `helm`, `docker` หรือสั่ง rollout ใด ๆ
- หน้าที่ด้าน pipeline ของ Agent คือ push และ remote-verify branch ตาม mode; `Version + Tags` ต้องทำ annotated tag push/remote verification ตาม §7 ต่อให้ครบด้วย จากนั้น Jenkins job ที่ตั้ง trigger ไว้ฝั่ง server จึงทำงานเอง trigger ไม่ได้อยู่ใน repo นี้ (`Jenkinsfile` ไม่มี `triggers {}` block)
- Pipeline ทั้งสองไฟล์ทำแค่ SonarQube analysis, Build และ Push to registry ไม่มี stage rollout ดังนั้น pipeline เขียว = **มี image ใหม่ใน registry** ยังไม่ได้แปลว่าของขึ้น server แล้ว
- Agent จึงต้องรายงานว่า "push แล้ว" หรือ "promote แล้ว" เท่านั้น ห้ามรายงานว่า deploy สำเร็จหรือ pipeline ผ่าน เว้นแต่ตรวจ pipeline จริงได้

### 6.2 ลำดับ branch ที่ Agent ต้องทำ

`Inhouse` จบที่ `jenkins`

```text
develop -> jenkins   (checkout, merge --ff-only, push)   จบ
```

`Production` ต้องไหลครบสามขั้น

```text
develop -> jenkins -> jenkins-release   (checkout, merge --ff-only, push ทีละขั้น)
```

- **ห้าม `develop -> jenkins-release` โดยตรงเด็ดขาด** ไม่ว่ากรณีใด แม้ `jenkins` จะตามหลังอยู่ก็ต้อง promote `jenkins` ให้ทันก่อนเสมอ ถ้า merge ข้ามขั้นให้หยุดและรายงานเป็น violation
- `jenkins-release` ต้อง merge จาก **exact verified SHA ของ `jenkins`** ที่เพิ่ง push และ verify กับ remote แล้ว ไม่ใช่จาก `develop` และไม่ใช่จาก local branch ที่ยังไม่ verify
- "ผ่าน jenkins gate" ในเอกสารนี้หมายถึง **code ต้องไหลผ่าน branch `jenkins` ก่อน** เป็นข้อบังคับเรื่องลำดับ ไม่ได้แปลว่าต้องรอ pipeline เขียว Agent ทำ `jenkins` แล้วต่อ `jenkins-release` ได้ทันทีในรอบเดียว
- ทุกขั้นใช้ `--ff-only` ถ้า fast-forward ไม่ได้ให้พัก merge/push ขั้นนั้นและทำ divergence diagnosis ด้านล่าง ห้ามสร้าง merge commit หรือ force push อัตโนมัติ
- ก่อนเริ่ม promote ให้ตรวจและจัดการ scoped commit phase ในโฟลเดอร์เดิมให้ครบก่อน switch branch ห้ามลาก unrelated staged/unstaged changes ข้าม branch; ถ้า switch/pull ยังติดจริงให้รายงานไฟล์และ integration decision ไม่สร้าง clone/worktree อัตโนมัติ
- **เลข version แก้ที่ `develop` เท่านั้น** ทุกกรณี: `prepare` เขียน owner file ตอนอยู่บน `develop`, commit และ push `develop` ให้เสร็จก่อน แล้วเลขจึงเดินทางไปกับ `--ff-only` merge เอง ห้าม checkout ไป `jenkins` หรือ `jenkins-release` แล้วแก้ `Jenkinsfile`/`Jenkinsfile_Production` ที่นั่น เพราะจะทำให้ branch diverge และ fast-forward รอบถัดไปพัง
- กรณีที่ขึ้นเฉพาะ Production (`Version Production`, `Version + Tags`) `jenkins` ยังต้องถูก promote ให้ทันเสมอ เพียงแต่ `Jenkinsfile` ไม่ถูก bump ในรอบนั้น
- mode กลุ่ม `prepare-*` (`Prepare Inhouse`, `Prepare Production`, `Prepare Both`) **จบที่ push `develop` สำเร็จ ห้าม promote branch ต่อ** แม้จะเห็นว่า `jenkins` หรือ `jenkins-release` ตามหลังอยู่ ให้รายงาน branch promotion และ pipeline เป็น `not requested` พร้อมแจ้ง exact verified develop SHA เพื่อให้คนนำไป promote เองตามลำดับใน §6.2

- Owner file ต้องมี `IMAGE_TAG = 'v<V>'` และ `PROJECT_VERSION = '<V>'` อย่างละหนึ่งบรรทัดและตรงกันพอดี Missing/duplicate/malformed/mismatch ต้อง fail โดยไม่เขียน
- Inhouse prepare แตะ version เฉพาะ `Jenkinsfile`; Production prepare แตะเฉพาะ `Jenkinsfile_Production`; Both ทำสอง mapping แยกกัน
- ก่อน `prepare` ต้องอยู่ `develop` ที่ sync ด้วย `--ff-only` แล้วและบันทึก pre-prepare SHA; หาก dirty ให้จำแนกก่อน ห้าม pull/switch ทับงาน ตรวจ resumable candidate จาก notes/index/Git ก่อนเลือก candidate ใหม่; หากเจ้าของเปลี่ยนเป้าหมายชัด ให้เก็บหลักฐาน candidate เดิม ปรับเฉพาะ metadata/notes ที่ยังไม่เผยแพร่และพิสูจน์ว่าเป็นของ run นี้ ตรวจ candidate ใหม่และยกเลิก confirmation เดิมที่อ้าง candidate เก่า โดยรักษางานอื่นและประวัติที่เผยแพร่แล้ว
- ก่อน commit ทุก version mode ต้องตรวจทั้ง `git diff -- <owner-file>`, `git diff --cached -- <owner-file>` และผลรวมเทียบ pre-prepare SHA; อนุญาตเฉพาะ exact `IMAGE_TAG`/`PROJECT_VERSION` pair ของ environment ที่เลือก และตรวจว่า pipeline file อื่นไม่ถูกแก้ในรอบนี้ด้วย ห้ามให้ staged change หลุด gate หรือเอา pipeline/governance change ที่ยังไม่ commit มารวม release commit
- Pipeline/governance changes ที่ owner commit ไว้ก่อน pre-prepare SHA เป็นประวัติที่ต้อง audit/changelog ตาม §5 และไหลไปกับ promotion ได้; ข้อห้ามแก้ pipeline ใน version intent ไม่ได้สั่งให้ลบ/revert ประวัตินั้น
- ก่อน commit รัน relevant `verify`, tests/build ของ code change และ `git diff --check`; docs/version-only ห้ามอ้างว่ารันทดสอบ feature ใหม่หากไม่ได้รัน
- หาก pull/fetch พบ candidate เปลี่ยนหลัง local verification ต้องตรวจ diff/coverage/verify ใหม่ก่อน commit/push ห้าม promote SHA ใหม่โดยใช้ผลตรวจของ SHA เก่า; ทุก `ls-remote --heads` ต้องมี ref เป้าหมายและ SHA เท่ากับ exact SHA ที่ตั้งใจ push จึงผ่าน checkpoint
- Commit/push `develop` และ verify remote SHA:

  ```text
  git switch develop
  git pull --ff-only origin develop
  git add -- <scoped-files>
  git diff --cached --check
  git diff --cached --name-status
  git commit -m "bump: <Environment> <VERSION>"
  git push origin HEAD:develop
  git rev-parse HEAD
  git ls-remote --heads origin develop
  ```

- Inhouse ใช้ exact verified develop SHA:

  ```text
  git switch jenkins
  git pull --ff-only origin jenkins
  git merge --ff-only <verified-develop-sha>
  git push origin HEAD:jenkins
  git rev-parse HEAD
  git ls-remote --heads origin jenkins
  ```

- Inhouse-only สำเร็จให้จบตาม scope โดยรายงาน Production เป็น `not requested`; ทำ Production ต่อเฉพาะ owner สั่งเพิ่ม ส่วน `both`/`version-both` ต้องทำทั้งสองให้ครบโดยไม่ถามแทรกกลาง flow
- Production ต่อจาก `jenkins` ได้ทันทีในรอบเดียวโดยไม่ต้องรอ pipeline (ดู §6.2) และต้องใช้ exact verified jenkins SHA จากขั้นก่อนหน้า:

  ```text
  git switch jenkins-release
  git pull --ff-only origin jenkins-release
  git merge --ff-only <verified-jenkins-sha>
  git push origin HEAD:jenkins-release
  git rev-parse HEAD
  git ls-remote --heads origin jenkins-release
  ```

- Branch push ไม่ใช่หลักฐาน pipeline/deployment success จนกว่าจะตรวจ pipeline จริง ข้อนี้เป็นกติกาเรื่อง **การรายงาน** ไม่ใช่เงื่อนไขให้หยุดรอ: Agent promote ต่อได้เลย แต่ต้องรายงาน pipeline/deployment เป็น `pending` หรือ `not verified` แทนที่จะอ้างว่าผ่าน
- เมื่อจบกลับ branch เริ่มต้นหรือ `develop` และรายงาน worktree

#### Divergence diagnosis and recovery

- หลัง fetch แยกตรวจสองความสัมพันธ์: local target กับ `origin/<target>` และ `origin/<target>` กับ exact verified source SHA; local branch ที่ diverged ไม่ใช่หลักฐานว่า remote promotion ทำไม่ได้
- ตรวจ ancestry ด้วย `git merge-base --is-ancestor`, commit differences ด้วย `git log --left-right` และ actual file diffs รวม local-only commits; จำนวน commits และ commit subjects เป็นเพียงเบาะแส ไม่พิสูจน์ code conflict หรือว่างานใดควรถูกทิ้ง คำสั่ง ancestry exit 1 หมายถึงไม่เป็น ancestor ส่วน exit อื่นที่เป็น error ต้องตรวจแยก
- ถ้า remote target เป็น ancestor ของ verified source แต่ติดเฉพาะ local target ให้ตรวจ local-only commits และเสนอการรวมประวัติในโฟลเดอร์เดิมตาม scope ที่อนุญาต; ห้ามสร้าง clone/worktree, reset/delete local branch หรือรวม local-only commits ที่ยังไม่ได้ตรวจขอบเขตเพื่อข้ามปัญหา การเปลี่ยน checkout ต้องมีคำสั่งผู้ใช้ชัดเจน ห้ามถามยืนยัน push ซ้ำเมื่อ authorization เดิมครอบคลุม
- ถ้า remote target กับ verified source diverged จริง ให้ตรวจ merge feasibility ด้วยเครื่องมือที่ไม่แก้ branch/worktree เช่น `git merge-tree` เมื่อรองรับ และรายงาน conflict paths หรือผลตรวจที่พิสูจน์ได้; ถ้าเครื่องมือไม่รองรับให้ระบุข้อจำกัด ห้ามอ้างว่า merge ผ่านโดยยังไม่ได้ตรวจ
- เสนอทางเลือกที่รักษาประวัติ พร้อมวิธีแนะนำและผลกระทบ การใช้ non-fast-forward merge เป็นข้อยกเว้นต่อกติกาปัจจุบัน ต้องมี owner decision ที่ครอบคลุมวิธีรวมประวัติและการตรวจผลก่อนลงมือ; การไม่พบ conflict ไม่ใช่สิทธิ์สร้าง merge commit อัตโนมัติ ยกเว้นกรณีที่ owner อนุมัติถาวรใน §6.5 (merge `origin/develop` และ back-merge `jenkins`/`jenkins-release` เข้า develop)
- หาก owner อนุมัติ merge commit ต้องตรวจ source ancestry และ merged content แทนสมมติฐานว่า source/target SHA เท่ากัน บันทึก target SHA ใหม่และ verify remote target ให้ตรง SHA ที่ push; Production ต้องรับ exact verified jenkins SHA และ tag ต้องชี้ exact verified Production SHA ตามเดิม
- ก่อน push ตรวจ remote อีกครั้ง ถ้าเปลี่ยนจากฐานที่ตรวจไว้ให้ประเมินใหม่; ห้ามใช้ force เพื่อข้ามการเปลี่ยนแปลงของคนอื่น เมื่อแก้ blocker แล้วให้ resume checkpoint ที่ค้างโดยรักษา version และ authorization เดิม ไม่ bump/commit/promote ขั้นที่ผ่านแล้วซ้ำ

### 6.3 Complete working-copy publication สำหรับกลุ่ม B

กติกานี้เป็นข้อยกเว้นเฉพาะสี่ intent ใน §2.3 และมี precedence เหนือข้อจำกัดการรวมงานเดิม/การเก็บ final artifacts ไว้ local ใน §1, §2.1, §6.2, §8.1 และ §9.5 โดยไม่ขยายสิทธิ์เขียน pipeline behavior หรือแก้ source ขึ้นใหม่

1. ก่อน prepare บันทึก branch/HEAD/upstream และ inventory จาก `git status --short`, `git diff`, `git diff --cached`, `git ls-files --others --exclude-standard` ให้ครบ รวม file deletion และไฟล์ที่มีทั้ง staged/unstaged hunks อ่านเนื้อหาไฟล์ใหม่ด้วย จัดทุก path เป็น publish หรือ blocked พร้อมเหตุผล ห้ามข้ามไฟล์เพียงเพราะเป็นงานก่อนหน้า/unrelated ต่อ version
2. รวม final working-copy content ของทุก path ที่ตรวจแล้ว รวม application, tests, config, pipeline และ governance ที่มีอยู่ก่อนเริ่มงาน ตรวจ secret, credential, generated/build output, ignored files, nested repository และ path นอก allowlist; ห้าม force-add ignored files หรือ publish ข้อมูลลับ ถ้าจัดการไม่ได้ให้หยุดพร้อม exact paths และ owner decision ไม่ stash แล้วรายงานว่าส่งครบ
3. Reconcile committed + working-copy changes กับ changelog และ project index ตรวจ tests/build ที่เหมาะกับงานที่รวมจริง Stage ด้วย exact paths เท่านั้น (`git add -- <reviewed-paths>`) รวม deletion ห้าม `git add .`, `git add -A`, `git commit --only` ที่ทำให้งานค้างตกหล่น หรือ stash เพื่อซ่อนงานจาก coverage gate
4. Commit งานเดิมทั้งหมดเป็น content commit บน `develop` ก่อน prepare (ข้ามเมื่อไม่มี delta) ข้อความตามชนิดงานจริงใน AGENTS.md §10.6 (`feature:`/`fix:`/`comment:` แยก commit เมื่อต่างชนิด) โดย pipeline/governance ที่ค้างเป็นประวัติของ content commit จากนั้นบันทึก SHA นี้เป็น pre-prepare/source candidate ตรวจ baseline และ resume ก่อน bump version ตาม owner file และ commit release metadata แยกต่างหาก ดังนั้น version commit ยังแก้ Jenkins ได้เฉพาะ version pair แต่ promotion/tag รวม content commit ด้วย
5. ก่อน push ตรวจ combined diff เทียบ initial HEAD, changelog coverage, staged diff check และ inventory อีกครั้ง ต้องไม่มี publishable path ตกหล่น แล้ว push `develop` และตรวจ remote SHA ก่อน promote ตาม §6.2 และทำ tag ตาม §7 เมื่อขอ หากพบการแก้ใหม่ระหว่าง freeze/promotion ให้หยุดและรายงาน ไม่แทรกเข้า candidate ที่ตรวจแล้วเงียบ ๆ
6. หลัง remote release/tag checkpoint ให้ finalize report, recent memory, terminal event และ project index โดยบันทึก release SHA ที่ตรวจแล้วตามจริง จากนั้นทำ final audit commit (`audit: บันทึกประวัติ release <VERSION>`) เฉพาะ artifacts ที่ตรวจแล้วบน `develop` และ push/verify `origin/develop` อีกครั้ง การ push นี้อยู่ใน intent กลุ่ม B; ห้าม bump ซ้ำ, promote audit commit หรือย้าย tag ให้บันทึก release SHA กับ final develop SHA แยกกัน
7. Final audit payload บันทึกว่า release checkpoint ผ่านและ audit publication ยัง pending จน push ผ่าน; รายงานผล push/remote verification ของ audit commit ในคำตอบสุดท้าย ไม่เขียน SHA ของ audit commit ลงตัวมันเองและไม่สร้าง artifact/commit วนซ้ำหลัง freeze หาก push fail ให้คง commit เดิมและ resume push SHA นั้นโดยไม่ bump/promote/tag ใหม่
8. จบได้เมื่อ publishable staged/unstaged/untracked inventory เป็นศูนย์, remote release branches/tag ผ่าน checkpoint และ remote develop ตรง final audit SHA (หรือ release SHA ถ้าไม่มี audit delta) Final report ต้องแจกแจง exclusions/blocked paths, release SHA, final develop SHA และสถานะ pipeline ห้ามอ้างทุก branch เท่ากันหลัง audit follow-up

### 6.4 รวมงานที่ทำเสร็จเข้า develop ก่อน release (M)

**ขอบเขต (4.9.9):** release สนใจแค่ `develop`/`jenkins`/`jenkins-release` และ work branch ของงานนี้เท่านั้น คือ branch ปัจจุบัน, branch ที่ส่งงานใน session นี้ หรือที่ผู้สั่งระบุ (`--branches`); branch อื่นที่ใครแตกไว้**ไม่ดู ไม่รายงาน ไม่ถาม** (`--scope all` เฉพาะเมื่อสั่งรวมทุก branch)

งานที่ส่งเข้า work branch แล้วต้องไปกับ release โดยไม่ต้องสั่ง merge ทีละ branch ขั้นนี้ใช้กับ prepare, pipeline, release ทุกแบบและกลุ่ม B (หลัง pending-work gate ก่อน I/H/P) ส่วน promote ทำหลัง T เพื่อให้ `develop` ครบสำหรับรอบถัดไป

1. ไฟล์ที่ยังไม่ commit บน work branch ปัจจุบันต้อง `deliver plan/apply` ก่อน (commit ตาม AGENTS.md §10.6 และ push work branch); ประวัติ `.agrimap-agent` ที่เขียนหลังส่งงาน (log/recent memory) ซึ่งขวางการ switch ให้ commit บน work branch นั้นเป็น `audit: บันทึกประวัติงาน`; ไฟล์ค้างบน `develop` เป็น content commit ตาม §6.3
2. `integrate pending` แสดง work branch (prefix ตาม policy) ที่ยังไม่อยู่ใน `develop` พร้อมสถานะ: `ready` = ส่งผ่าน deliver และ test ผ่าน, `unverified`, `manual` (ไม่มี AGM-Execution หรือมี commit หลังส่งงาน) และ branch ที่ชนกับ `develop`
3. `integrate gather plan` แล้ว `integrate gather apply --plan-hash <hash>`: รวม branch ของงานนี้ด้วย merge commit (ข้อความ Merge ของ Git) เข้า local `develop` โดยไม่ switch worktree และไม่ push ไม่มี card
4. **Conflict ให้ Agent แก้เอง ไม่ถาม:** ถ้า branch ของงานนี้ชนกับ `develop` script คืน `resolve` พร้อมขั้นตอน ให้ merge `develop` เข้า branch นั้น แก้ conflict โดยรักษาเจตนาทั้งสองฝั่ง รัน test, commit (ข้อความ Merge ของ Git), push branch แล้ว gather ใหม่ ถามเฉพาะเมื่อสองฝั่งแก้ business logic เดียวกันขัดกันจนต้องให้คนเลือก
5. ตรวจ build/test ของ `develop` หลังรวม แล้วจึง index/changelog/prepare; merge commit ไปกับการ push `develop` ครั้งเดียวของขั้น D (promote ไปกับ final audit push)
6. หลังมี candidate แล้ว (pipeline หรือ resume) M รายงานอย่างเดียวและไม่รันซ้ำ: ใช้ `integrate pending` ตรวจ ถ้ามี branch `ready` ใหม่ให้ถามครั้งเดียวว่าจะเตรียมใหม่ด้วย `release <env>` version เดิม (รวมแล้ว reconcile changelog/notes) หรือปล่อยไปรอบหน้า ห้ามแทรกงานเข้า candidate ที่ตรวจแล้วเงียบ ๆ
7. ห้าม rebase, squash, force, stash หรือลบ branch อัตโนมัติ; รายงานชื่อ branch และ SHA ที่รวม, ที่ข้ามพร้อมเหตุผล และ merge SHA ใน final report

### 6.5 Preflight คำถามรอบเดียว และ sync อัตโนมัติ

Owner decision 2026-09-29 (4.9.8): release ต้องจบในการสั่งครั้งเดียวเมื่อไม่มีเรื่องที่ต้องตัดสินจริง

1. **ตรวจครั้งเดียวก่อนเตรียม version (R):** รัน `release preflight` (script ของ skill) ซึ่ง fetch ครั้งเดียวแล้วรายงานสถานะ `develop`/`jenkins`/`jenkins-release`, เลข owner ทั้งสอง, tag ล่าสุด, ไฟล์ค้าง, M และ `autoActions`/`questions`/`blockers` ห้ามค้นทีละคำสั่งซ้ำเอง
2. **ไม่ถามเรื่อง branch:** `resolve` จาก preflight คือสิ่งที่ Agent ทำเอง (merge, แก้ conflict, test, commit) แล้วทำต่อจนจบ ไม่มีการยืนยัน Production; คำถามที่เป็นไปได้มีแค่ความผิดปกติตาม §2.1 และ `questions` ที่ script ส่งมา (ถ้ามี) ให้ถามรวมในรอบเดียวด้วยเครื่องมือถามคำถามของ host
3. **Sync อัตโนมัติ (ไม่ต้องถาม):** `release sync plan/apply` merge `origin/develop` และ back-merge `origin/jenkins`/`origin/jenkins-release` ที่ไม่ใช่ ancestor เข้า local `develop` เสมอ รวมกรณีที่มีงาน (hotfix) ที่ develop ยังไม่มี เพื่อให้ promote แบบ `--ff-only` ได้ เป็น merge commit ของ Git ใน local ไม่ push และรายงานไฟล์ที่ได้มา (4.9.9); ถ้าชน script คืน `resolve` ให้ Agent `git merge <ref>` บน `develop` แก้ conflict รัน test แล้ว commit เองโดยไม่ถาม
4. **ก่อน push develop (D):** หลัง commit candidate รัน `release sync plan/apply` อีกครั้งแล้ว push ทันที ถ้า push ถูกปฏิเสธเพราะมีคน push เข้ามา ให้ sync แล้ว push ใหม่เองได้สูงสุด 2 ครั้งโดยไม่ถาม ถ้า merge นำเนื้อหาใหม่เข้ามาให้เติม changelog/notes ของ delta นั้นและตรวจ owner pair ใหม่ ห้าม bump ซ้ำ
5. **ไม่เปลี่ยนกติกากลางทาง:** ตรวจ bootstrap freshness ที่ R เท่านั้น release ที่ resume ใช้กติกาชุดเดิมจนจบ bootstrap ที่ใหม่กว่า**ไม่ขวาง** promote/tag/notify ของ candidate ที่ freeze แล้ว และห้าม refresh candidate เพราะ bootstrap ให้อัปเดตใน final audit (F) หรือ release ถัดไป
6. **บันทึก:** เขียนไฟล์ log/memory/report ด้วย file tool หรือ script ห้ามใช้ `echo`/here-string ของ shell ที่ทำอักขระเพี้ยน; ระหว่างทางไม่สร้าง audit commit ย่อย ให้รวมใน final audit commit เดียวของ F
7. **`--flash`:** อ่านไฟล์นี้เฉพาะ §2.3, §5.2, §6, §7, §8.2; ใช้ผล preflight แทนการตรวจทีละคำสั่ง; ใช้ผลตรวจเครื่องมือ .NET ที่บันทึกไว้ไม่เกิน 7 วันเมื่อ `dotnet tool list -g` ยังเป็นเวอร์ชันเดิม; ตรวจเฉพาะ delta; เป้าหมายเวลา active ไม่เกิน 5 นาทีเมื่อไม่มีคำถาม

## 7. Production annotated tag

- Section นี้ทำงานกับ mode `version-with-tags` (`Version + Tags` และ alias ใน §2) และคำสั่ง agm-release `release production`, `release full`, `promote` (§2.2); keyword `production`/`both` ไม่มี tag เช่นเดียวกับ version mode ที่ไม่ขอ tag
- `Version + Tags` มี terminal checkpoint ที่ remote annotated tag ไม่ใช่ที่ branch push: หลัง push และ remote-verify `jenkins-release` สำเร็จ Agent ต้องสร้าง ตรวจ annotation และ push `refs/tags/v<VERSION>` ใน run เดียวกัน ห้ามรายงาน `completed` หรือหยุดรอคำยืนยันซ้ำก่อน tag push ถ้าไม่มี stop condition จริง
- mode อื่นทั้งหมดห้ามสร้าง tag และต้องรายงาน tag เป็น `not requested` ได้แก่ `prepare-inhouse`, `prepare-production`, `prepare-both`, `version-inhouse`, `version-both`, `version-only`, `release-baseline`, `project-backfill`, `diff-only` และ `develop-complete`
- Production `<VERSION>` ต้องอ่านจาก pair ใน `Jenkinsfile_Production`; `<production-sha>` ต้องเท่ากับ remote `jenkins-release`
- ก่อน prepare/resume ตรวจ local และ remote tag ของ candidate เดิม: same annotated tag object + same commit + identical notes ให้ verify/resume ขั้นที่ยังขาด; different object/commit/annotation หรือ lightweight tag ให้หยุด ห้าม update/move/delete/force ห้ามเพิ่ม PATCH ใหม่เพื่อหลบ tag collision หรือ tag push ที่ยังค้าง
- `release-notes/<VERSION>.md` ต้องอยู่ใน exact `<production-sha>` ที่ push แล้ว และ working-tree file ต้องตรงกับ blob ที่ SHA นั้นก่อนสร้าง tag เพื่อให้ tag description มาจาก release notes ล่าสุดที่ผ่าน promotion จริง ห้ามใช้ notes ที่แก้ภายหลังแต่ยังไม่ได้ push

  ```text
  git diff --quiet "<production-sha>" -- "release-notes/<VERSION>.md"
  git tag -a "v<VERSION>" "<production-sha>" --cleanup=verbatim -F "release-notes/<VERSION>.md"
  ```

- `--cleanup=verbatim` เป็นข้อบังคับเพื่อรักษาข้อความ annotation ตาม notes โดยไม่ขึ้นกับ cleanup configuration
- ก่อน push ตรวจ `git cat-file -t "refs/tags/v<VERSION>"` เป็น `tag`, `git rev-parse "refs/tags/v<VERSION>^{}"` เท่ากับ production SHA และเปรียบเทียบ annotation body ทั้งหมดจาก `git cat-file tag` (ตัดเฉพาะ tag headers ถึงบรรทัดว่างแรก) กับ blob `git show "<production-sha>:release-notes/<VERSION>.md"` ผ่านเครื่องมือที่รักษา UTF-8; อนุญาต normalize CRLF/LF เท่านั้น ห้ามใช้จำนวนหัวข้อ/บรรทัดแทน content equality ถ้าไม่ตรงให้หยุดพร้อมหลักฐาน ห้ามลบ tag เพื่อสร้างใหม่เอง
- หลัง annotation verification ผ่าน ให้ push และ remote-verify annotated tag เป็น terminal checkpoint:

  ```text
  git push origin "refs/tags/v<VERSION>"
  git ls-remote --tags origin "refs/tags/v<VERSION>" "refs/tags/v<VERSION>^{}"
  ```

- ต้องได้ remote สอง refs: `refs/tags/v<VERSION>` เท่ากับ local tag object SHA จาก `git rev-parse "refs/tags/v<VERSION>"` และ peeled `refs/tags/v<VERSION>^{}` เท่ากับ exact verified Production SHA; output ว่าง, มีแต่ lightweight ref, SHA ไม่ตรง หรือ command fail ไม่ผ่าน gate แม้ push exit 0
- `version-with-tags` ห้าม complete หาก remote annotated tag checkpoint ไม่ผ่าน ไม่ต้องสร้าง GitLab Release object และไม่ใช้ `glab`; ถ้า branch push ผ่านแล้วแต่ tag ยังขาด ให้บันทึก `blocked` พร้อม candidate/production SHA และ resume ที่ tag เดิมโดยไม่ bump/commit/promote ซ้ำ

## 8. Project memory/index, resume และรายงาน

- `.agrimap-agent/memory/project.md` เป็น canonical memory/index สำหรับทุกคน ไม่ใช่ transcript; current facts/catalog ปรับตามหลักฐานได้ ส่วน completed work/checkpoints เก็บประวัติและเพิ่ม correction/supersedes โดยไม่ rewrite audit history
- ทุก durable checkpoint เพิ่มหนึ่งบรรทัดใน `## Checkpoints` ของ `.agrimap-agent/memory/project.md`: date, mode, environment, version/no-version, SHA, branch, tag, status และ links
- Deduplicate ด้วย mode+environment+version/no-version+SHA+checkpoint+status เพื่อไม่ให้ branch checkpoint กลบ tag checkpoint หรือ doc audit รอบใหม่; partial ใช้ `blocked|prepared` พร้อม next action; resume ต้องอ่าน index+Git remote ก่อนทำ checkpoint ถัดไป
- Final report ต้องมี selected mode/trigger, baseline/candidate SHA, diff/changelog coverage, environment versions/owner files, release notes, verification, commit/push/merge, annotated tag, project index, omitted actions และ next decision
- เมื่อจำเป็นต้องขอ owner decision ให้ระบุสาเหตุที่พิสูจน์แล้วและสิ่งที่ยังไม่ทราบ, checkpoint ที่ผ่าน/ค้าง, ทางเลือกที่ทำได้พร้อมผลกระทบ, วิธีที่แนะนำพร้อมเหตุผล และขั้นตอนที่จะทำต่อหลังได้รับคำตอบ แล้วถามให้ owner เลือกวิธีอย่างชัดเจน ห้ามจบเพียง “branch diverged” หรือ “ต้องตัดสินใจก่อน”; ถ้ามีวิธีปลอดภัยที่อยู่ใน authorization เดิมให้ดำเนินการก่อน ไม่สร้าง approval gate เพิ่ม
- ใช้สถานะ `completed`, `blocked`, `pending`, `not requested`, `not applicable` ตามจริง ไม่มี conditional pass และระบุคำสั่ง/ผลที่รันจริงโดยไม่เผย secret
- การเพิ่ม deployment mode ต้องแก้ routing, owner files, ordered gates, CLI/tests และ project-memory checkpoint event ในจุดส่วนกลางเดียวกัน

### 8.1 Completion gate ต่อ mode

| Mode | หลักฐานที่ต้องครบก่อน `completed` |
| --- | --- |
| `develop-complete`, `diff-only` | committed/dirty coverage ตาม §5, changelog entry หรือ justified exclusion ทุก change, project index และ diff check |
| `project-backfill` | Diff/reconcile full reachable-history + source/tests/docs/CI inventory, capability catalog, historical changelog แบบ DESC, README capability/API tables, dirty coverage และ completeness evidence ตาม §5; ห้ามจบด้วยประวัติเฉพาะวันนี้เมื่อยังมี historical gaps |
| `release-baseline` | notes ของ current Production SHA ที่พิสูจน์ได้, cumulative inventory ตาม §5.1, release index และ verification; ถ้ายังระบุ SHA ไม่ได้ห้ามใช้ develop แทน |
| `prepare-*` | notes ตาม environment, changelog/verify ผ่าน, release commit และ remote develop SHA ตรง candidate; promotion/pipeline/tag เป็น `not requested` |
| `inhouse`, `version-inhouse` | local gates และ remote develop -> jenkins SHA ตรงกันตามลำดับ; Production/tag เป็น `not requested` |
| `production`, `both`, `version-only`, `version-both` | local gates และ remote develop -> jenkins -> jenkins-release SHA ตรงกันตามลำดับ; tag เป็น `not requested` |
| `version-with-tags` | ทุก gate ของ `version-only` แล้ว annotation equality, tag push และ remote tag object/peeled SHA ผ่าน §7 |
| agm-release `release production`, `release full`, `promote` | ทุก gate ของ `version-with-tags` และ Release Description ตาม §8.2 เป็น `sent`, `pending` (พร้อมคำสั่งส่งซ้ำ) หรือ `skipped (--silent)`; ขาด tag หรือ notify ยังไม่ `completed` |

- เลือก mode และทำรายการ required checkpoints ก่อน mutation; บันทึกผลจริงต่อ checkpoint และขั้นถัดไป ถ้าขั้นที่จำเป็นยังไม่ทำและไม่มี blocker ให้ดำเนินการต่อ ไม่ตอบ final ว่าสำเร็จบางส่วน
- `completed` ของ report/lifecycle ต้องเกิดหลัง gate ของงานจริง ไม่ใช่ใช้การมี report/checklist หรือ helper exit 0 มาแทน gate; หากหยุดเพราะ failure ให้รายงาน `blocked` พร้อม exact command/exit code, checkpoint ที่ผ่านแล้วและ next action
- บันทึกหลักฐาน release ที่จำเป็นก่อน freeze candidate; กลุ่ม B ต้อง publish final audit/report ตาม §6.3 และ completion gate รวม final develop remote checkpoint ส่วน mode อื่นที่ publish ให้ commit `audit:` และ push `develop` หนึ่งครั้งโดยไม่ promote/tag, mode local เก็บ final artifacts เป็น local follow-up ห้ามให้ release SHA บันทึกตัวเอง

### 8.2 Release Description และแจ้งเตือนทีม

ใช้กับ `release production`, `release full` (รวม `--flash`) และ `promote` ทุกครั้งที่ Production tag checkpoint ผ่าน รวม release ที่หยุดรอยืนยันแล้วจบด้วย `promote` หรือ resume; ส่งครั้งเดียวต่อ version; `release inhouse`, `pipeline`, `prepare` และกลุ่ม A/B ไม่ส่ง

แจ้งเตือนมี 2 แบบแยกกัน: **Jenkins build card** (`POST …/release`) ส่งจาก `post { always }` ของ `Jenkinsfile`/`Jenkinsfile_Production` พร้อม metadata ของ build ส่วน Agent ไม่แก้ไข; **Release Description** (`POST …/release-description`) คือสรุปที่ script สร้างตามหัวข้อนี้ ส่งเฉพาะชื่อ project, version และรายการที่แก้พร้อม project ที่เกี่ยวข้อง

- **Release Description** เป็นภาษาคนที่ BA copy ส่งลูกค้าได้ทันที เขียนไทย สั้น ตรง ไม่ใช้ชื่อ class/ไฟล์/route/SHA เป็นเนื้อหา:

  ```markdown
  # <ชื่อ project> / <Production version>
  - เพิ่ม...
  - แก้...
  - ปรับขั้นตอนเข้าสู่ระบบ... (เกี่ยวข้อง: agmws-identity-netcore)
  ```

- รูปแบบตายตัว: บรรทัดแรก `# <project> / <version>` แล้วตามด้วย `- ` bullet ทันที ไม่มีบรรทัดว่าง หัวข้อย่อย ตาราง ตัวหนา หรือข้อความนำ/ปิดท้าย

- **สร้างด้วย script เท่านั้น ห้ามเขียนหรือเรียบเรียงเอง** เพื่อให้ทุก project ได้รูปแบบและถ้อยคำเดียวกัน: `node tools/agrimap/release-notify.mjs generate --version <Production version> --out .agrimap-agent/reports/YYYY-MM/<RUN_ID>-release-description.md` รายการมาจาก header ของ commit `feature:`/`fix:` (ตัด `(x.y.z)`, รวมข้อซ้ำ) ตั้งแต่ tag `v*` ก่อนหน้า ไม่รวม `comment:`/`bump:`/`audit:`/`ci:`
- `(เกี่ยวข้อง: …)` เติมอัตโนมัติจากบรรทัด `เกี่ยวข้อง:` ใน body ของ commit และจาก package `AgriMap.*` (NuGet ใช้สองส่วนแรก เช่น `AgriMap.Platform`) หรือ `@agrimap/*` ที่เปลี่ยน; ข้อความไม่ดีให้แก้ที่ commit header ไม่แก้ไฟล์ที่ generate; exit 1 `RELEASE_DESCRIPTION_EMPTY` ให้รายงาน ห้ามแต่งรายการเอง
- บันทึกที่ `.agrimap-agent/reports/YYYY-MM/<RUN_ID>-release-description.md` (commit ไปกับ `audit:` commit) และคำตอบสุดท้ายต้องมีหัวข้อ `description-released` ตามด้วยข้อความเต็มใน code block `markdown` ตามรูปแบบข้างต้นเสมอ ไม่ว่า notify จะ `sent`, `pending` หรือ `skipped (--silent)`; ขาดหัวข้อนี้ถือว่ายังไม่ `completed`
- ส่งด้วย `node tools/agrimap/release-notify.mjs send --description <file> --environment Production` ซึ่งตรวจ `…/healthz` ก่อน POST ทุกครั้ง URL มาจาก env `NOTIFY_WEBHOOK_URL` (เช่น `https://appserv2.cdg.co.th/agrimap-notify/release-description`)
  - exit 2 (ไม่มี env): ถามครั้งเดียวด้วยเครื่องมือถามคำถามของ host (ไม่ถามเป็นข้อความธรรมดา) ตาม `question` ที่ script ส่งมา ตัวเลือกแรกคือ URL มาตรฐาน แล้วรัน `set-url` บันทึก env ถาวรบนเครื่อง จากนั้นส่งต่อใน invocation เดิม
  - exit 3/4 (health หรือ POST ล้มเหลว): release ยังถือว่าสำเร็จ รายงาน notify เป็น `pending` พร้อม HTTP status และคำสั่งส่งซ้ำ ห้าม retry วนหรือส่งซ้ำเมื่อ `sent: true` แล้ว
- `--silent` (alias `--skip-noti`) ข้ามเฉพาะการส่ง ยังเขียนและแสดง Release Description; รายงาน notify เป็น `skipped (--silent)`
- ไฟล์ `tools/agrimap/release-notify.mjs` เป็น managed bootstrap file ถูกแทนที่ทุกครั้งที่อัปเดต bootstrap (มี backup) ห้ามแก้ใน project
