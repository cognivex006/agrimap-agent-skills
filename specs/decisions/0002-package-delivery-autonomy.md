# 0002 — การส่งมอบใน repository agrimap-agent-skills ทำได้เลยโดยไม่ต้องขออนุญาต

- สถานะ: อนุมัติแล้ว (owner decision 2026-11-01, บันทึกใน 5.0.10)
- ผู้ตัดสินใจ: owner ของ agrimap-agent-skills
- ขอบเขต: เฉพาะการพัฒนา source repository นี้ (`cognivex006/agrimap-agent-skills`) **ไม่รวม** project ที่นำ skills ไปใช้งาน

## บริบท

ก่อนหน้านี้ commit/push, merge PR, tag และ release แยกขอบเขตการอนุญาตกัน AI จึงต้องถามทีละขั้น แม้ owner จะมอบงานพัฒนา package ไว้ชัดแล้ว ทำให้งานค้างระหว่างที่ owner ไม่อยู่หน้าจอ ทั้งที่ local verification (`npm run package:verify`) เป็น gate ที่ตกลงกันไว้แล้ว (owner decision 2026-09-25)

## การตัดสินใจ

เมื่อ owner มอบงานพัฒนา repository นี้ AI ทำขั้นต่อไปนี้ได้ทันทีโดยไม่ต้องขออนุญาต

- commit และ push ไปยัง development branch (`feature/*`, `fix/*`, `release/*`, `hotfix/*`)
- เปิดและ merge PR/MR เข้า develop และ main ตาม flow ใน DEVELOPMENT.md
- ขึ้นเวอร์ชัน ปิด changelog สร้าง tag `v<version>` และ publish GitHub Release ด้วย `npm run package:publish`

เงื่อนไขที่ต้องทำทุกครั้ง

1. **แจ้งให้ชัดก่อนลงมือ:** บอก branch, PR ปลายทาง, version, source SHA, tag และค่า `--latest` ก่อนรันแต่ละขั้น
2. **รายงานผลจริงหลังทำ:** ใส่ URL ของ PR/release, SHA และผล verification จริง รวมถึงสิ่งที่ยังไม่ได้ตรวจ เช่น OS ที่ไม่ได้รัน
3. **gate เดิมยังอยู่:** ห้าม commit ตรงเข้า main ต้องผ่าน `package:verify` ก่อน merge และ publish รูปแบบ commit ตามทีม และไม่ข้าม server rule
4. **เคารพ Terms of Use:** ปฏิบัติตาม GitHub Terms of Service และ Acceptable Use Policies รวมถึงเงื่อนไขของ service หรือเครื่องมืออื่นที่เลือกใช้
   - ใช้เฉพาะบัญชีที่ owner authenticate ไว้
   - ไม่หลบ rate limit, branch protection หรือ required check
   - ไม่ทำกิจกรรมอัตโนมัติแบบ bulk หรือ spam
   - ไม่ใส่ secret/token ใน commit, log หรือ release notes
   - เนื้อหา third-party ที่แนบไปใน package ต้องมี license ที่อนุญาต

   ถ้าขั้นไหนอาจขัดเงื่อนไขเหล่านี้ ให้หยุดและรายงาน

## สิ่งที่ยังต้องถาม owner

- ลบหรือสร้างใหม่ซึ่ง tag/release ที่ publish แล้ว หรือแทนที่ asset
- force-push, rewrite history หรือลบ remote branch ที่คนอื่นอาจใช้
- เปลี่ยน server protection หรือ repository settings
- ทำงานใน repository อื่น (เช่น agrimap-golden-lint-skills, sql-context-pack)

## ขอบเขตที่ไม่ครอบคลุม

กฎนี้เป็นกฎสำหรับผู้พัฒนา package นี้เท่านั้น ห้ามนำไปใส่ runtime skill, hook หรือ bootstrap template (`assets/bootstrap/AGENTS.md`) ของ product project เพราะ project ที่นำ skills ไปใช้ยังใช้ขอบเขต commit/merge/release ของ project นั้นตามเดิม

## เหตุผล

- งานพัฒนา package มี gate อัตโนมัติที่ตรวจได้จริง (tests, token budgets, packaging, commit style) การถามซ้ำทีละขั้นไม่ได้เพิ่มความปลอดภัย แต่ทำให้งานค้าง
- การแจ้งชัดก่อนและหลังทำทำให้ owner ตรวจย้อนหลังได้ทุกขั้น
- ขั้นที่ย้อนกลับไม่ได้หรือกระทบคนอื่นยังต้องให้คนตัดสิน
