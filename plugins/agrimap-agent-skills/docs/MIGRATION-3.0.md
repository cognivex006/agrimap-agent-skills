# ย้ายจาก 2.x เป็น 3.0.0

[หน้าหลัก](../README.md) · [Getting Started](GETTING-STARTED.md) · [Troubleshooting](TROUBLESHOOTING.md)

3.0 เปลี่ยนการตัดสินใจของ runtime/hook ไม่ใช่แค่ข้อความคู่มือ การแก้ repository ไม่อัปเดต plugin cache หรือ project AGENTS เดิมให้เอง

## Public commands ที่นำออก

นำ agm-design, agm-simulate, agm-review และ agm-history ออกจาก distributed aliases และ Gemini commands แล้ว ไม่มี compatibility alias แฝง Design เป็น passive recommendations ใน operation ที่เหลือ; ใช้ agm-analyze สำหรับประเมิน/ตรวจ/พิจารณาสถานการณ์แบบอ่านอย่างเดียว

ประวัติ audit และ internal history tooling ยังเก็บไว้ ไม่ลบหลักฐานเก่า การเปลี่ยน source ไม่ลบคำสั่งจาก cache ของ session เดิม ต้องอัปเดต installation แล้วเปิด session ใหม่

## สิ่งที่เปลี่ยน

| 2.x ที่เคยพบ | 3.0 สำหรับงานใหม่ |
| --- | --- |
| เริ่ม lifecycle/ถาม identity แทบทุก request | คำถามไม่มี execution/task |
| tracked work ต้องครบห้าไฟล์ | task.md เดียว; เอกสารแยกเมื่อมีผู้ใช้ผลลัพธ์ |
| expiry รายวันเป็นค่าเริ่มต้น | confirmation ใหม่ default persistent local user/workspace |
| คุย Prompt Result ต่อแล้วเกิด version | เฉพาะ substantive requester-backed revision |
| QA เต็มตามจำนวนรอบ / ซ่อมได้รอบเดียว | coverage ตามความเสี่ยง; bounded repair เมื่อมี progress |
| โหลด references กว้าง / ให้ prompt ใหม่ยืนยันงานเดิม | โหลดตามโจทย์; ใช้ authorization ที่มีอยู่ |
| model/file count ช่วยบังคับ depth | depth จาก tracking/risk; model เปลี่ยนเฉพาะ scaffolding |

## ขั้นตอนย้ายโดยไม่ลบหลักฐาน

1. ตรวจว่า version ที่ต้องการอยู่ใน remote หรือ local source จริง อย่าอนุมานจากเลขใน README
2. ผู้ดูแล source รัน sync/validate; ผู้ใช้ติดตั้ง/อัปเดตตาม host แล้วเปิด session ใหม่
3. ตรวจ project AGENTS และ configuration เดิมว่ามีนโยบายขัดกับ v3 หรือไม่ รายงานก่อนแก้ ไม่ overwrite โดยอัตโนมัติ
4. ทดลองคำถามอ่านอย่างเดียวจาก Getting Started
5. ทดลอง bounded edit ที่อนุมัติแล้ว ตรวจว่าไม่มี tasks เว้นแต่ต้อง tracking/risk จริง

ไม่ต้องรัน Project Backfill หรือ release เพื่อ migrate skill

## Existing identity และ configuration

ไม่ลบ .agrimap-agent หรือ bulk rewrite history งาน 2.x ที่มี brief/checklists/analysis/qa/result ยังอ่านและจบด้วย legacy validator ได้ งานใหม่เท่านั้นที่ใช้ task.md

identity v1 ที่หมดอายุไม่ถูกอนุมัติใหม่เงียบ ๆ และ configuration เดิมที่กำหนด identity.confirmationHours ยังคงมีผล หากทีมต้องการ persistent confirmation ให้เลือกค่า 0 อย่างชัดเจนหรือใช้ identify --confirmation-hours 0 หลัง human confirmation ดู [runtime guide](MAINTAINING.md)

ชื่อผู้สั่งไม่เคยเท่ากับ decision authority หรือสิทธิ์ release

## Prompt Results และ reports เดิม

เก็บ immutable version files ไว้ ไม่เปลี่ยน status field เพื่อบันทึก approval ใหม่ อ้าง exact source/hash กับ requester decision ใน audit แทน

Report เดิมเป็นหลักฐานเก่า ไม่ต้องสร้าง report ใหม่ให้ทุกงานที่นำมาอ่าน current/recent memory ใช้สำหรับ resume/outcome ไม่ใช่สำเนา raw chat

## Bootstrap adoption เป็นอีกงานหนึ่ง

Bundle 3.0 ใช้ canonical AGENTS ฉบับเต็มที่ owner ส่งล่าสุด ไม่ย่อข้อความและไม่ copy pipeline/version ของ service ตัว installer copy bundle แบบ byte-exact และแทรก Deployment เฉพาะ block

Repo ที่รับ contract นี้ใช้ portable recording §9 ซึ่งบังคับ terminal report และใช้ group-B complete-working-copy publication/final audit commit ตาม §6.3 ต่างจาก optional-report default ของ skill-package และไม่รอ pipeline เขียวก่อน promote Production อ่าน AGENTS ฉบับเต็มก่อน adoption ไม่ยกกฎนี้ไปครอบทุก project โดยอัตโนมัติ

Plan target ก่อน ถ้า AGENTS หรือ Deployment เดิมต่าง ให้ตกลง adoption/merge ไม่ force overwrite ไม่มีการ copy Jenkinsfiles, reset versions หรือสร้าง branches ดู [Bootstrap และ Release](RELEASE.md)

## Verification และข้อจำกัด

Current gates ตรวจ v3 runtime, utilities, SQL file contracts, MCP, generated mirrors และ golden integrity ส่วน test:legacy-v2 เก็บข้อคาดหวังที่ถูกยกเลิก ไม่ใช่หลักฐานว่า v3 ต้องทำแบบเดิม

Golden byte integrity ต้องคงไว้ข้าม Windows/Linux checkout ไม่ normalize หรือเปลี่ยน manifest hashes เพื่อกลบ content mismatch

ตั้งแต่ 6.1.1 ไม่มี instruction profile ตามรุ่น model แล้ว ทุกรุ่นรับ constraints + acceptance แบบเดียวกัน
