## Deployment

กติกากลางอยู่ที่ [AGENTS.md](AGENTS.md) เท่านั้น อ่าน intent routing, Git gates, tag และ portable recording จากไฟล์นั้น ส่วน [release notes schema](release-notes/README.md) กำหนดโครงสร้างเอกสาร

Flow คือ `develop -> jenkins -> jenkins-release` โดย push `jenkins` สำหรับ Inhouse และ push `jenkins-release` สำหรับ Production ตาม trigger ที่ตั้งฝั่ง server Agent ตรวจ remote SHA ทีละขั้น แต่ไม่ต้องรอ pipeline เขียวก่อน promote Production และไม่สั่ง rollout เอง Branch push หรือ pipeline เขียวไม่ใช่หลักฐานว่าขึ้น server แล้ว

มนุษย์ส่ง intent ให้ Agent เช่น `Project Backfill`, `Prepare Both`, `Version Inhouse`, `Version Production` หรือ `Version + Tags`; Agent รันเครื่องมือและตรวจผลตาม AGENTS ไม่ให้มนุษย์ไปรัน CLI/Git ต่อเอง การยก keyword เป็นตัวอย่างไม่ใช่คำสั่ง release

กลุ่ม Prepare-* จบที่ verified develop SHA; กลุ่ม B รวม publication ของงานค้างที่ตรวจครบและ final audit commit ในเครื่อง (ไม่ push ไปกับ release ถัดไป) ตาม AGENTS §6.3 Only Version + Tags สร้าง annotated Production tag Final develop SHA หลัง audit อาจต่างจาก release SHA และ audit commit ไม่ถูก promote/tag

Version owners คือ `Jenkinsfile` สำหรับ Inhouse และ `Jenkinsfile_Production` สำหรับ Production ใช้เลข Version/Patch ที่เจ้าของระบุชัดแยกตาม environment; เมื่อไม่ระบุจึงคำนวณ PATCH+1 จาก owner จริง ไม่ reset Git หรือเขียนทับประวัติที่เผยแพร่แล้ว Bootstrap ติดตั้งเอกสาร ไม่แก้ pipeline หรือสร้าง release
