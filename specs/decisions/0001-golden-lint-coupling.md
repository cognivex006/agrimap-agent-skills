# 0001 — ความสัมพันธ์ระหว่าง agrimap-agent-skills กับ agrimap-golden-lint-skills

- สถานะ: อนุมัติแล้ว (owner decision 2026-11-01, บันทึกใน 5.0.10)
- ผู้ตัดสินใจ: owner ของทั้งสอง package
- ขอบเขต: การพัฒนาทั้งสอง repository และทุกครั้งที่ AI เพิ่ม แก้ หรือเปลี่ยนชื่อกฎ Golden

## บริบท

`agrimap-golden-lint-skills` 0.1.15 pin agent-skills แบบตรงตัว (`source-lock.json` `expectedVersion: 5.0.7` พร้อม SHA-256 ของไฟล์อ้างอิงแต่ละไฟล์) พอ agent-skills ออก 5.0.8 และ 5.0.9 lint จึงไม่ยอมตรวจ แม้กฎที่ lint ใช้จะไม่ได้เปลี่ยนความหมายเลย ทุก patch ของ agent-skills จึงทำให้ lint หยุดทำงานจนกว่าจะออก lint ใหม่ตาม

## การตัดสินใจ

ทั้งสอง package ทำงานต่างกัน จึงต้องไม่ผูกเวอร์ชันกันแน่นขนาดนี้

| Package | หน้าที่ | ช่วงเวลาที่ใช้ |
| --- | --- | --- |
| agrimap-agent-skills | เป็นที่อยู่ของกฎ Golden ทั้งหมด เพื่อให้ AI **เขียนถูกตั้งแต่แรก** | ตอนเขียนหรือแก้โค้ดใหม่ |
| agrimap-golden-lint-skills | **ตรวจย้อนหลัง** project ที่ทำไปแล้ว เพื่อช่วยตัดสินใจว่าจะปรับแก้อะไร | ตอน review โค้ดที่มีอยู่ ไม่แก้โค้ด |

1. กฎทุกข้อที่ lint ตรวจต้องมีกฎคู่กันใน agent-skills ที่บอกว่าห้ามเขียนแบบนั้นและให้เขียนอย่างไร เช่น SEC-01..22 ใน 5.0.9 ([security-baseline.md](../../skills/agrimap-agent-skills/references/patterns/security-baseline.md))
2. Lint อ้าง agent-skills แบบ **ช่วงเวอร์ชันที่เข้ากันได้** ไม่ใช่เลขเดียว patch และ minor ใหม่ของ agent-skills ต้องตรวจต่อได้โดยไม่ต้องออก lint ใหม่
3. ถ้า digest ของไฟล์อ้างอิงไม่ตรงที่ lint บันทึกไว้ ให้รายงานเป็นคำเตือนว่า Golden เปลี่ยนและควรทบทวน detector แต่ยังตรวจต่อ ส่วนกรณีที่ควร block กฎนั้นคือ ไฟล์อ้างอิงหายไป อ่านไม่ได้ หรือหา rule ID ที่ detector ผูกไว้ไม่เจอ
4. การแก้ฝั่ง lint ทำใน repository ของ lint เอง (owner สั่งแก้แยกแล้ว) agent-skills ไม่ต้องรอ lint ก่อนออกเวอร์ชัน

## เหตุผล

- กฎเปลี่ยนที่ agent-skills ก่อนเสมอ เพราะเป็นเจ้าของกฎ ถ้า lint ล็อกตรงตัว ทุกการปรับปรุงกฎจะทำให้เครื่องมือตรวจย้อนหลังหยุดไปจนกว่า lint จะตามทัน
- Lint ให้ผลเป็น review candidate ไม่ใช่คำตัดสินสุดท้าย การตรวจกับ Golden ที่ใหม่กว่าเล็กน้อยพร้อมคำเตือนมีประโยชน์กว่าไม่ตรวจเลย
- การล็อก digest ยังมีค่าในฐานะหลักฐานว่าอ่านไฟล์อ้างอิงฉบับไหน แต่ไม่ควรใช้เป็นเงื่อนไขหยุดทำงาน

## สิ่งที่ agent-skills ต้องรักษา (สัญญาฝั่งนี้)

Lint ที่รับช่วงเวอร์ชันได้จับคู่กฎด้วย `goldenRuleId` และชื่อ section จึงต้องรักษาสิ่งเหล่านี้ให้คงที่:

- **Rule ID คงที่:** เช่น `SEC-*`, `CTL-*`, `NS-*`, `NULL-*`, `ERR-*`, `ASYNC-*`, `QUALITY-*`, `ADV-*`, `REPO-*`, `T6`, `R1`, `R3`, `N*` ห้ามเปลี่ยนความหมายของ ID เดิม และห้ามนำ ID ที่เลิกใช้แล้วกลับมาใช้ใหม่
- **ชื่อ section และ path ที่ lint ใช้:** เช่น `csharp.md` "Async, errors, data, and logs", "Namespaces, files, and naming", `sql.md` "DDL contract", "Output artifact contract", "Message collection gate", `references/patterns/golden/**` และ `checklists/*.md` ถ้าจำเป็นต้องเปลี่ยนชื่อหรือย้าย ให้เขียนชื่อเดิมกับชื่อใหม่ไว้ใน CHANGELOG ของเวอร์ชันนั้น
- **กฎใหม่ที่ lint ตรวจได้ต้องมาพร้อมกฎฝั่งเขียนใน agent-skills** และกฎใหม่ใน agent-skills ที่ตรวจด้วยเครื่องได้ ให้ระบุ rule ID ไว้เพื่อให้ lint เพิ่ม detector ตามได้
- **การเปลี่ยนที่ทำให้ lint เข้าใจกฎผิด** เช่น เปลี่ยนความหมายของ MUST/SHOULD เปลี่ยน ID ทั้งชุด หรือย้ายโครงสร้าง references ใหญ่ ให้ถือเป็น major version ของ agent-skills และเขียนไว้ใน CHANGELOG

## ผลที่ตามมา

- AI ที่พัฒนา agent-skills ห้ามเสนอหรือเพิ่มกลไกที่ทำให้ lint ต้องออกตามทุก patch และห้ามถือว่าการที่ lint ยังไม่รองรับเวอร์ชันใหม่เป็นเหตุให้เลื่อน release ของ agent-skills
- AI ที่พัฒนา lint ใช้เอกสารนี้เป็นเหตุผลในการตั้งช่วงเวอร์ชันที่รับได้ และแยกคำเตือนเรื่อง digest drift ออกจากการ block
- เอกสารนี้ไม่ให้สิทธิ์เพิ่มใดๆ ในการ commit, merge หรือ release ข้าม repository
