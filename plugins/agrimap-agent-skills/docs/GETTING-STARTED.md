# Getting Started — เริ่มใช้ AgriMap Skills

[หน้าหลัก](../README.md) · [คำสั่งทั้งหมด](USAGE.md) · [ตัวอย่างพร้อมใช้](COMMAND-COOKBOOK.md)

เป้าหมาย: ติดตั้งกับ host ที่ใช้อยู่ เปิดโครงการ และทดลองอ่านโค้ดหนึ่งครั้ง ไม่จำเป็นต้องรู้ชื่อ model, workflow_depth หรือคำสั่ง runtime

## 1. เตรียมเครื่อง

ต้องมี Git, Node.js 20 ขึ้นไป และ host อย่างใดอย่างหนึ่งที่ติดตั้ง/ลงชื่อเข้าใช้แล้ว: Codex, Claude Code หรือ Antigravity CLI

**รันใน Terminal / PowerShell:**

```powershell
git --version
node --version
```

ถ้าไม่พบคำสั่ง ให้จัดเตรียม dependency ตามวิธีของทีมก่อน ไม่ต้องติดตั้งทั้งสาม host

## 2. ติดตั้งสำหรับ host ของคุณ

Repository ย้ายไป `cognivex006/agrimap-agent-skills` แล้ว ก่อนติดตั้งให้ตรวจว่าปลายทางมี source หรือ release ของรุ่นที่ต้องการจริง การเปลี่ยน URL ไม่ได้ย้าย release/assets เดิมโดยอัตโนมัติ หากยังไม่มีให้รายงานว่า unavailable ตาม [คู่มือเวอร์ชัน](VERSIONS.md)

ต้องการเลือกรุ่นเก่าหรือ pin รุ่นที่ระบุ ดู [เลือกเวอร์ชัน](VERSIONS.md) ใช้ runtime artifact ของ release นั้นเมื่อมี ไม่ใช้ branch HEAD แทนรุ่นที่ขอ

เลือกเพียงหนึ่งหัวข้อ คำสั่งในขั้นนี้ติดตั้ง plugin จึงเปลี่ยน configuration ของ host ไม่ใช่คำสั่งถาม Agent และไม่แก้ source ของโครงการ

### Codex

**Terminal / PowerShell:**

```powershell
codex plugin marketplace add cognivex006/agrimap-agent-skills
codex plugin add agrimap-agent-skills@agrimap-agent-skills
```

ถ้ารุ่นที่ใช้ไม่รู้จัก subcommand ให้ตรวจ `codex plugin --help` และ [Troubleshooting](TROUBLESHOOTING.md) ก่อน ไม่ใช้ slash command ของ Claude แทน รูปแบบ CLI ข้างต้นตรวจจาก local CLI help เมื่อ 2026-09-08; การมองเห็น/ติดตั้ง plugin ยังขึ้นกับ host และ workspace configuration ดู [OpenAI plugin documentation](https://learn.chatgpt.com/docs/plugins)

### Claude Code

**Terminal / PowerShell:**

```powershell
claude plugin marketplace add cognivex006/agrimap-agent-skills
claude plugin install agrimap-agent-skills@agrimap-agent-skills
```

Claude ใช้ชื่อ plugin กำกับคำสั่ง เช่น `/agrimap-agent-skills:agm-analyze` การเพิ่ม marketplace อย่างเดียวยังไม่ใช่ติดตั้ง plugin ดู [Claude Code installation](https://code.claude.com/docs/en/discover-plugins)

### Antigravity CLI

**Terminal / PowerShell ไม่ใช่ใน Antigravity chat:**

```powershell
agy plugin install https://github.com/cognivex006/agrimap-agent-skills
```

ตรวจคำขอความยินยอมของ host ตามปกติ ไม่ต้องเพิ่ม flag ข้าม consent ดู [Antigravity plugin reference](https://antigravity.google/docs/cli/plugins)

ตรวจรายการด้วย `agy plugin list` แพ็กเกจ 4.1.0 มี root `plugin.json` และ flat Markdown skills สำหรับ Antigravity โดยตรง ส่วน `GEMINI.md` และ `AGENTS.md` ยังใช้เหมือนเดิมตาม [คู่มือ migration](https://antigravity.google/docs/cli/gcli-migration) ไม่ต้องเปลี่ยนชื่อไฟล์ หากย้ายจาก Gemini เดิม ให้ตรวจ onboarding/import ของ host ก่อน ไม่ถอนการติดตั้งเดิมโดยอัตโนมัติ

### ถ้าต้องการ source ที่เพิ่งแก้ในเครื่อง

คำสั่งจาก GitHub ได้เฉพาะสิ่งที่เผยแพร่ไปแล้ว อาจยังไม่ใช่ 4.1.0 ที่อยู่ใน working copy ใช้ [การติดตั้ง local package](MAINTAINING.md#local-install) แทน อย่าคัดลอกไฟล์เข้า cache ด้วยมือ

## 3. เปิด session ใหม่ในโครงการเป้าหมาย

เปิด root ของ AgriMap project ที่ต้องการทำงาน ไม่ใช่ root ของ skill package นี้ หลังติดตั้ง/อัปเดต เปิด session ใหม่เพื่อให้ host โหลดคำสั่งและ instruction ใหม่

ยังไม่ต้อง init หรือ bootstrap เพื่อถามคำถาม การ bootstrap เอกสารลงโครงการเป็นงานแยกที่ต้องร้องขอ ดู [Bootstrap](RELEASE.md#bootstrap)

### ตรวจความพร้อมและอัปเดตด้วย agm-doctor

พิมพ์ใน Agent chat ใช้ `$agm-doctor` สำหรับ Codex, `/agrimap-agent-skills:agm-doctor` สำหรับ Claude หรือ `/agm-doctor` สำหรับ Antigravity (ใช้ชื่อที่ host แสดงหากมี namespace)

| คำสั่ง | หน้าที่ | ผลต่อเครื่อง |
| --- | --- | --- |
| `agm-doctor` | สรุปรุ่นและความพร้อมในเครื่อง | อ่านอย่างเดียว |
| `agm-doctor version` | เทียบรุ่นที่ติดตั้งกับแหล่งเผยแพร่ พร้อมบอกถ้าตรวจไม่ได้ | อ่านอย่างเดียว |
| `agm-doctor check` | ตรวจ host, configuration และ dependency เช่น SQLFluff พร้อมวิธีแก้ | อ่านอย่างเดียว |
| `agm-doctor update` | อัปเดต AGM สำหรับ host ปัจจุบัน | เปลี่ยนการติดตั้ง AGM |
| `agm-doctor update --host antigravity` | เลือก host: codex / claude / antigravity; agy เป็นชื่อย่อ | เปลี่ยนเฉพาะ host ที่เลือก |
| `agm-doctor update --to 4.1.0` | เลือกรุ่น AGM ที่มีอยู่จริงในแหล่งติดตั้ง | ไม่เปลี่ยนเป็น latest แทนโดยเงียบ ๆ |

เริ่มจาก check แล้วค่อย update เมื่ออยากอัปเดต การตรวจไม่ติดตั้งสิ่งที่ขาดให้เอง และ dependency ที่ขาดของ SQL จะระบุขอบเขต SQL ไม่ตัดสินว่า FE/BE ทั้งหมดล้มเหลว ดู [Doctor ฉบับเต็ม](DOCTOR.md) สำหรับสถานะและการกู้คืน หลัง update เปิด session ใหม่

หากต้องการอัปเกรดไฟล์ bootstrap ในโครงการด้วย ให้สั่ง `agm-release bootstrap upgrade` แยกในโครงการเป้าหมาย จะสำรองไฟล์และรักษากฎเฉพาะโปรเจกต์ ไม่ bump เวอร์ชัน product หรือ push/tag ดู [คำสั่ง release ทั้งหมด](RELEASE.md)

## 4. ทดลองอ่านอย่างเดียว

**พิมพ์ใน Agent chat — เลือก host:**

Codex:

```text
$agm-analyze ช่วยสรุปโครงสร้างโปรเจกต์นี้จากไฟล์จริง ระบุ entry point และโฟลเดอร์หลัก ยังไม่แก้ไฟล์และไม่รัน test
```

Claude Code:

```text
/agrimap-agent-skills:agm-analyze ช่วยสรุปโครงสร้างโปรเจกต์นี้จากไฟล์จริง ระบุ entry point และโฟลเดอร์หลัก ยังไม่แก้ไฟล์และไม่รัน test
```

Antigravity CLI:

```text
/agm-analyze ช่วยสรุปโครงสร้างโปรเจกต์นี้จากไฟล์จริง ระบุ entry point และโฟลเดอร์หลัก ยังไม่แก้ไฟล์และไม่รัน test
```

ตรวจผลสามอย่าง: อ้างไฟล์ที่มีจริง, ไม่มี product diff ใหม่, ไม่สร้าง tasks สำหรับคำถามนี้ raw prompt history ที่เกี่ยวข้องอาจถูกเก็บโดย hook แยกจาก task

หากมีแต่การเดาข้อมูล หรือถามชื่อ owner ก่อนตอบคำถามนี้ อ่าน [Troubleshooting](TROUBLESHOOTING.md)

## 5. เริ่มงานแก้ไขเมื่อพร้อม

ใช้ [Cookbook](COMMAND-COOKBOOK.md) เลือก FE/BE/SQL ให้ตรงงาน เปลี่ยน path ตัวอย่างเป็นไฟล์จริง แล้วระบุผลลัพธ์ที่ต้องการ สิ่งที่ต้องคงเดิม และวิธีดูว่าทำเสร็จ

ไม่ต้องเรียก analyze → plan → prompt → exec → qa ให้ครบทุกครั้ง หากรู้สิ่งที่จะเปลี่ยนชัดแล้ว สั่ง `agm-fe action=edit` หรือ `agm-be action=edit` ได้ตรง ๆ

ก่อนงานที่ต้องบันทึก Agent อาจขอชื่อผู้สั่งที่ยังไม่เคยยืนยัน ยืนยันชื่อจริงที่ต้องการใช้อ้างอิง ไม่ต้องกรอก role=owner เพื่อให้ทุกคำสั่งทำงาน ชื่อไม่ใช่สิทธิ์ release

## ไปต่อ

- [ดูคำสั่งตามประเภทงาน](USAGE.md)
- [ลองโจทย์พร้อมใช้](COMMAND-COOKBOOK.md)
- [เข้าใจว่าเมื่อไรสร้าง task และทดสอบ](WORKFLOWS.md)
