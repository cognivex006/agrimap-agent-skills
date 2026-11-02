# 0003 — `pipeline inhouse` ไม่ขึ้นเวอร์ชัน และส่ง code ปัจจุบันขึ้น jenkins ด้วยเลขเดิมได้

- สถานะ: อนุมัติแล้ว (owner decision 2026-11-02, บันทึกใน 5.0.11)
- ผู้ตัดสินใจ: owner ของ agrimap-agent-skills
- ขอบเขต: คำสั่ง agm-release `pipeline inhouse` (มีหรือไม่มี `--flash`) ใน product project ที่ใช้ skills

## บริบท

ตั้งแต่ 3.2.0 skill กำหนดให้ `pipeline inhouse` ส่งได้เฉพาะ candidate ที่ `prepare inhouse` เตรียมไว้แล้ว และถือว่า "ไม่มี candidate" เป็น prerequisite ที่ขาด แต่ตั้งแต่ 4.9.3 product `AGENTS.release.md` §2.3 บอกว่า `pipeline inhouse|production` รวมงานค้างทั้งหมดเข้าไปเองโดยไม่ต้องถาม สองข้อนี้ขัดกัน

เมื่อ Inhouse 1.0.8 ถูกส่งขึ้น `jenkins` ไปแล้ว และมี code ใหม่ใน worktree คำสั่ง `pipeline inhouse --flash` จึงหยุดและบอกให้ไปเตรียม candidate ใหม่ ซึ่งแปลว่าต้อง bump เป็น 1.0.9 ขัดกับเจตนาของ owner ที่ว่า "ไม่ต้อง bump version แค่เอา code ขึ้น develop -> jenkins"

## การตัดสินใจ

- `pipeline inhouse` ไม่ขึ้นเวอร์ชันในทุกกรณี
- คำสั่งนี้รวม work branch ที่ทำเสร็จ (M) และงานค้าง (§6.3) เข้า `develop` แล้วส่ง `develop -> jenkins` ด้วยเลขที่อยู่ใน `Jenkinsfile` ตอนนั้น
- ถ้าเลขนั้นอยู่บน `jenkins` อยู่แล้ว ให้ส่งซ้ำด้วยเลขเดิม ไม่ถือว่า prerequisite ขาด และไม่ต้องถาม
- ถ้าต้องการเลข Inhouse ใหม่ ให้ใช้ `release inhouse` หรือ `prepare inhouse` ตามด้วย `pipeline inhouse`

## สิ่งที่ไม่เปลี่ยน

- `pipeline production` และ `promote` ยังต้องมี candidate Production ที่เตรียมแล้ว เพราะ Production เป็นเจ้าของ release notes และ tag
- gate อื่นยังอยู่ครบ ได้แก่ verify, fast-forward-only, single push per ref, stop condition และการตัดข้อมูลลับ/runtime state ออก

## ผลที่ตามมา

- image Inhouse ที่ build ใหม่จะใช้ tag เลขเดิม เช่น `v1.0.8` ทับของเดิมใน registry ประวัติว่าส่ง code อะไรขึ้นไปเมื่อไรจึงดูจาก Git SHA ของ `jenkins` และ checkpoint ใน `.agrimap-agent/memory/project.md` ไม่ใช่ดูจากเลข version
