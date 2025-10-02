# View Network

A Chrome extension for monitoring network requests with size, time, and error information, with cURL export capability.

## Features

- Track all network requests made by the browser
- Display request details including:
  - HTTP method
  - URL
  - Response size (ขนาด)
  - Response time (เวลา)
  - HTTP status code (สถานะ)
- View request and response headers
- View request and response bodies
- Filter requests by URL, method, or status
- Export request data as JSON
- Copy requests as cURL commands
- Color-coded status codes for easy error identification
- Support for all HTTP methods

> Note: This extension uses Manifest V3 and can observe network requests but cannot block or modify them.

## Installation / การติดตั้ง

### วิธีที่ 1: ติดตั้งจาก Source Code (สำหรับ Developer)

#### ข้อกำหนดเบื้องต้น

- Google Chrome browser เวอร์ชัน 88 หรือใหม่กว่า
- ไฟล์ Extension ที่ดาวน์โหลดมาแล้ว

#### ขั้นตอนการติดตั้ง

1. **ดาวน์โหลด Extension**

   ```bash
   git clone https://github.com/Lock-Lee/chrome-extention-view-network.git
   cd chrome-extention-view-network
   ```

2. **เปิด Chrome Extensions Manager**
   - เปิด Google Chrome
   - ไปที่ `chrome://extensions/` หรือ
   - คลิกเมนู Chrome (⋮) → More tools → Extensions

3. **เปิดใช้งาน Developer Mode**
   - คลิกสวิตช์ "Developer mode" ที่มุมขวาบนให้เป็นสีฟ้า

4. **โหลด Extension**
   - คลิกปุ่ม "Load unpacked"
   - เลือกโฟลเดอร์ที่มีไฟล์ `manifest.json`
   - คลิก "Select Folder" หรือ "เลือกโฟลเดอร์"

5. **ยืนยันการติดตั้ง**
   - Extension จะปรากฏในรายการ Extensions
   - ไอคอน View Network จะแสดงในแถบเครื่องมือของ Chrome

### วิธีที่ 2: ติดตั้งจาก .crx File (ถ้ามี)

1. ดาวน์โหลดไฟล์ `.crx`
2. ลากไฟล์ `.crx` ไปวางในหน้า `chrome://extensions/`
3. คลิก "Add extension" เพื่อยืนยันการติดตั้ง

### วิธีที่ 3: ติดตั้งจาก Chrome Web Store (เมื่อเผยแพร่แล้ว)

> **หมายเหตุ:** ขณะนี้ Extension ยังไม่ได้เผยแพร่บน Chrome Web Store

### การตรวจสอบการติดตั้ง

หลังจากติดตั้งเสร็จสิ้น คุณสามารถตรวจสอบได้โดย:

หลังจากติดตั้งเสร็จแล้ว คุณจะเห็น:

- ไอคอน View Network ในแถบเครื่องมือ
- สามารถคลิกไอคอนเพื่อเปิด popup ได้
- สามารถใช้ keyboard shortcut **Ctrl+Shift+M** (Windows/Linux) หรือ **Cmd+Shift+M** (macOS)

### การแก้ไขปัญหาการติดตั้ง

#### ปัญหาที่พบบ่อย

1. **ไม่สามารถโหลด Extension ได้**
   - ตรวจสอบว่าเปิด Developer mode แล้ว
   - ตรวจสอบว่าเลือกโฟลเดอร์ที่มีไฟล์ `manifest.json`

2. **Extension ไม่ทำงาน**
   - ลองรีโหลด Extension ใน chrome://extensions/
   - ตรวจสอบ Console สำหรับ error messages

3. **ไม่เห็นไอคอนในแถบเครื่องมือ**
   - คลิกไอคอน Extension (ปุ่มตัวต่อ) และ pin ไอคอน View Network
   - หรือไปที่ Window → Extensions เพื่อจัดการไอคอน

### การอัปเดต Extension

1. ไปที่ `chrome://extensions/`
2. หาการ์ด View Network
3. คลิกปุ่ม "Reload" หรือ "รีโหลด"
4. หรือใช้ keyboard shortcut **Ctrl+R** (Windows/Linux) หรือ **Cmd+R** (macOS) ในหน้า Extensions

### การถอนการติดตั้ง

1. ไปที่ `chrome://extensions/`
2. หาการ์ด View Network  
3. คลิก "Remove" หรือ "ลบ"
4. ยืนยันการลบใน dialog ที่ปรากฏ

## Usage

1. Click on the View Network icon in your browser toolbar to open the popup, or use the keyboard shortcut:
   - **Ctrl+Shift+M** (Windows/Linux)
   - **Command+Shift+M** (macOS)
2. Browse websites and watch network requests populate in real-time
3. Click on any request to see detailed information
4. Use the filter box to search for specific requests
5. Click "Export JSON" to save the current network requests to a file
6. Click "Copy cURL Command" in the details view to copy a request as a cURL command
7. Click "Clear" to remove all captured requests

## Tab Sections

### Requests

Shows a table of all captured network requests with basic information.

### Details

Displays detailed information about a selected request, including:

- General information
- Request headers
- Request body
- Response headers
- Response body
- cURL command generation

## License

MIT
