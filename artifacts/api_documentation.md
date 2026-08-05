# Kautix School Management — Complete API Reference

> **Base URL:** `http://localhost:5000/api`
> **Auth Header:** `Authorization: Bearer <token>` (required on all routes unless noted)

---

## 🤖 Automatic Background Services (Cron)

| Trigger | Description |
|---------|-------------|
| `POST /api/fees/cron/monthly` + Header `x-cron-secret` | Generates monthly fee dues for all students at end of month |
| Fee Reminders | 2 days before due date, auto-triggered via `POST /api/fees/send-reminders` |
| Overdue Status | Auto-updated when payment not received by due_date |

---

## 1. Auth (`/api/auth`)

### `POST /auth/register` — Register School + Admin
No auth required.
```json
{
  "email": "admin@school.com",
  "password": "SecurePass123",
  "firstName": "Namit",
  "lastName": "Raj",
  "phone": "+919876543210",
  "schoolName": "Kautix Academy",
  "schoolCode": "kautix-academy",
  "board": "CBSE"
}
```
**Required:** `email`, `password`, `firstName`, `schoolName`

### `POST /auth/login` — Login
```json
{
  "email": "admin@school.com",
  "password": "SecurePass123",
  "role": "admin"
}
```
**Returns:** `{ user, token }`

### `GET /auth/me` — Get Current User
Auth: Bearer token. No body.

### `POST /auth/create-user` — Create User (Admin)
```json
{
  "email": "teacher@school.com",
  "password": "changeme123",
  "firstName": "John",
  "lastName": "Doe",
  "phone": "+919876543210",
  "role": "teacher"
}
```
**Role must be:** `teacher` | `parent` | `student`

---

## 2. Students (`/api/students`)

### `GET /students` — List Students
Query: `?sectionId=uuid&classId=uuid&status=active&search=name`

### `GET /students/:id` — Get Student Profile
Returns full profile: personal info, parent, section, attendance summary, exam results, fee history, timetable, assignments.

### `GET /students/dashboard` — Student Dashboard (student role)
Returns: `subjectPerformance`, `today_schedule`, `behavior_logs`, `risk_analysis`, `attendanceSummary`, `feeSummary`.

### `POST /students` — Create Student (admin/teacher)
```json
{
  "firstName": "Rahul",
  "lastName": "Kumar",
  "email": "rahul@school.com",
  "phone": "+919876543210",
  "sectionId": "uuid",
  "dateOfBirth": "2010-05-15",
  "gender": "male",
  "bloodGroup": "O+",
  "address": "123 Main St",
  "city": "Delhi",
  "state": "Delhi",
  "pincode": "110001",
  "fatherName": "Suresh Kumar",
  "motherName": "Anita Kumar",
  "guardianPhone": "+919876543211",
  "guardianEmail": "parent@email.com",
  "emergencyContact": "+919876543212",
  "previousSchool": "ABC School",
  "admissionNumber": "STD2026_001",
  "rollNumber": "15",
  "medicalConditions": "None",
  "allergies": "None"
}
```
> Auto-creates parent account, links parent↔student, sends credentials via Email/WhatsApp.

### `POST /students/bulk` — Bulk Create Students (admin)
```json
{
  "students": [
    {
      "firstName": "Rahul", "lastName": "Kumar",
      "className": "10", "sectionName": "A",
      "guardianPhone": "+919876543211"
    }
  ]
}
```

### `PUT /students/:id` — Update Student (admin/teacher)
Body: any student fields in snake_case.

### `POST /students/promote` — Promote Students (admin)
```json
{ "studentIds": ["uuid1", "uuid2"], "newSectionId": "uuid" }
```

---

## 3. Teachers (`/api/teachers`)

### `GET /teachers` — List Teachers
Query: `?status=active&department=Science&performance_min=4.0`

### `GET /teachers/dashboard` — Teacher Dashboard (teacher role)
Returns: `myClasses`, `upcomingExams`, `pendingAssignments`, `attendanceSummary`, `leaveBalance`.

### `GET /teachers/:id` — Get Teacher Profile

### `POST /teachers` — Create Teacher (admin)
```json
{
  "email": "teacher@school.com",
  "firstName": "Sarah",
  "lastName": "Wilson",
  "phone": "+919876543210",
  "employeeId": "EMP001",
  "designation": "Senior Teacher",
  "department": "Mathematics",
  "qualification": "M.Ed",
  "experienceYears": 10,
  "dateOfJoining": "2024-01-15",
  "specialization": "Algebra",
  "salary": 50000
}
```

### `POST /teachers/bulk` — Bulk Create (admin)
```json
{ "teachers": [ { /* same fields as above */ } ] }
```

### `PUT /teachers/:id` — Update Teacher (admin)

### `GET /teachers/leaves` — Leave Requests
Query: `?status=pending&teacher_id=uuid`

### `POST /teachers/leaves` — Submit Leave (teacher)
```json
{
  "teacherId": "uuid", "leaveType": "sick",
  "startDate": "2026-05-05", "endDate": "2026-05-06",
  "reason": "Medical appointment"
}
```

### `PUT /teachers/leaves/:id` — Approve/Reject (admin)
```json
{ "status": "approved" }
```

---

## 4. Admin (`/api/admin`)

### `GET /admin/dashboard` — Dashboard Stats
### `GET /admin/insights` — AI Insights (`?period=monthly`)

### `POST /admin/import/students` — Bulk Import
### `POST /admin/import/teachers` — Bulk Import

### `PATCH /admin/users/:userId` — Update User
```json
{ "firstName": "...", "lastName": "...", "phone": "...", "isActive": true }
```

### `DELETE /admin/users/:userId` — Deactivate User (soft delete)

### `GET /admin/classes` — Get Classes + Sections

### `POST /admin/classes` — Create Class
```json
{
  "name": "Class 10", "grade": 10, "academicYearId": "uuid",
  "sections": [{ "name": "A", "capacity": 40, "classTeacherId": "uuid" }]
}
```

### `GET /admin/audit-logs` — Query: `?page=1&limit=50`

---

## 5. Timetable (`/api/timetable`)

All routes require Bearer token. Slot management (create/update/delete) requires **admin** role.

### `GET /timetable` — Get Timetable
Query: `?classId=uuid&sectionId=uuid`

- **Admin**: filter by any class or section
- **Teacher**: auto-returns only their assigned periods
- **Student/Parent**: auto-returns their section's schedule

**Response:**
```json
{
  "slots": [
    {
      "id": "uuid",
      "section_id": "uuid",
      "subject_id": "uuid",
      "teacher_id": "uuid",
      "day_of_week": 1,
      "period_number": 1,
      "start_time": "08:00",
      "end_time": "08:40",
      "room_number": "101",
      "is_published": false,
      "subjects": { "name": "Mathematics", "code": "MATH" },
      "users": { "first_name": "John", "last_name": "Doe" }
    }
  ]
}
```
`day_of_week`: 0=Sunday, 1=Monday, ... 6=Saturday

---

### `POST /timetable/slot` — Create Slot (admin)
```json
{
  "sectionId": "uuid",
  "subjectId": "uuid",
  "teacherId": "uuid (references users.id)",
  "dayOfWeek": 1,
  "periodNumber": 1,
  "startTime": "08:00",
  "endTime": "08:40",
  "room": "101"
}
```
**Required:** `sectionId`, `subjectId`, `dayOfWeek`, `periodNumber`
> Validates conflicts: teacher double-booking and room double-booking for the same time slot.

**Response:** Created slot record.

---

### `PUT /timetable/slot/:id` — Update Slot (admin)
```json
{
  "subjectId": "uuid",
  "teacherId": "uuid",
  "dayOfWeek": 2,
  "periodNumber": 3,
  "startTime": "10:00",
  "endTime": "10:40",
  "room": "102"
}
```
All fields optional — only changed fields need to be sent.
> Re-validates conflicts excluding the current slot being edited.

---

### `DELETE /timetable/slot/:id` — Delete Slot (admin)
No body.
**Response:** `{ "message": "Slot deleted successfully" }`

---

### Subject Management (admin only)

### `GET /timetable/subjects` — List Subjects
**Response:** `[{ "id": "uuid", "name": "Mathematics", "code": "MATH" }]`

### `POST /timetable/subjects` — Create Subject
```json
{ "name": "Physics", "code": "PHY" }
```

### `POST /timetable/subjects/seed-defaults` — Seed Default Subjects
Seeds standard subjects if not present. No body.

### `DELETE /timetable/subjects/:id` — Delete Subject
Deletes subject by ID. No body.

### `POST /timetable/class-subjects` — Assign Subject to Class
```json
{ "classId": "uuid", "subjectId": "uuid" }
```

### `DELETE /timetable/class-subjects/:classSubjectId` — Remove Subject from Class
Removes the mapping. No body.

---

### `POST /timetable/publish` — Publish Timetable (admin)
```json
{ "sectionId": "uuid" }
```
- Marks all slots for the section as `is_published: true`
- Creates a version snapshot in `timetable_versions`
- Sends notifications to all students and parents in the section

---

### `POST /timetable/generate-ai` — AI Auto-Generate (admin/teacher)
```json
{
  "sectionId": "uuid",
  "preview": true,
  "prompt": "Avoid Math on Monday mornings"
}
```
- `preview: true` → returns slots without saving
- `preview: false` → saves directly to DB

---

### `GET /timetable/subjects` — Get All Subjects
Query: `?classId=uuid&sectionId=uuid` (optional filters)

**Response:** Array of `{ id, name, code, is_elective, description }`

---

### `POST /timetable/subjects` — Create Subject (admin)
```json
{
  "name": "Physics",
  "code": "PHY",
  "description": "Science stream core",
  "isElective": false
}
```
**Required:** `name`

---

### `DELETE /timetable/subjects/:id` — Delete Subject (admin)
No body.

---

### `POST /timetable/subjects/seed-defaults` — Seed Default Subjects (admin)
No body. Inserts defaults: English, Hindi, Math, Science, SST, Computer, GK, EVS, Sanskrit, etc.
**Response:** `{ "message": "Created N default subjects", "created": N }`

---

### `POST /timetable/class-subjects` — Assign Subject to Section (admin)
```json
{
  "classId": "uuid",
  "sectionId": "uuid",
  "subjectId": "uuid",
  "teacherId": "uuid",
  "periodsPerWeek": 5
}
```
**Required:** `classId`, `sectionId`, `subjectId`
> Upserts on `(section_id, subject_id)`. Notifies the assigned teacher.

---

### `DELETE /timetable/class-subjects/:classSubjectId` — Remove Subject from Section (admin)
No body.

---

## 6. Attendance (`/api/attendance`)

### `GET /attendance`
Query: `?section_id=uuid&date=2026-05-01&student_id=uuid&start_date=&end_date=`

### `GET /attendance/stats`
Query: `?period=30`

### `POST /attendance/mark` — Mark Attendance (admin/teacher)
```json
{
  "sectionId": "uuid",
  "date": "2026-05-01",
  "records": [
    { "studentId": "uuid", "status": "present", "remarks": "" },
    { "studentId": "uuid", "status": "absent", "remarks": "Sick" },
    { "studentId": "uuid", "status": "late", "remarks": "" }
  ]
}
```
> Auto-sends absence alerts to parents.

---

## 7. Fees (`/api/fees`)

### `GET /fees/structures` — Get Fee Structures
### `POST /fees/structures` — Create Fee Structure (admin)
```json
{
  "classId": "uuid",
  "name": "Tuition Fee",
  "amount": 15000,
  "frequency": "monthly",
  "dueDay": 10,
  "isMandatory": true,
  "academicYearId": "uuid"
}
```

### `GET /fees/payments` — Get Fee Payments
Query: `?student_id=uuid&status=pending&class_id=uuid&page=1&limit=20`

### `GET /fees/payments/:paymentId/transactions` — Get Payment Transactions

### `GET /fees/transactions` — All Transactions (admin)

### `POST /fees/collect` — Collect Fee (admin)
```json
{
  "paymentId": "uuid",
  "amount": 15000,
  "paymentMethod": "cash",
  "referenceNumber": "TXN123",
  "remarks": "Monthly",
  "notifyEmail": true,
  "notifyWhatsapp": true
}
```

### `POST /fees/add-extra` — Add Extra Fee for One Student (admin)
```json
{
  "studentId": "uuid",
  "title": "Library Fine",
  "amount": 200,
  "dueDate": "2026-08-01",
  "lateFee": 0,
  "notifyEmail": true,
  "notifyWhatsapp": false
}
```

### `POST /fees/bulk-assign` — Bulk Assign Fee (admin)
Apply a fee charge to All / Class / Section / Individual student.
```json
{
  "targetType": "class",
  "targetId": "uuid",
  "title": "Annual Sports Fee",
  "amount": 2000,
  "dueDate": "2026-08-01",
  "lateFee": 50,
  "remarks": "Sports day 2026",
  "notifyEmail": true,
  "notifyWhatsapp": false
}
```
`targetType`: `"all"` | `"class"` | `"section"` | `"student"`
> In-App notification is always auto-fired. Email/WhatsApp are optional.

### `POST /fees/sync-dues` — Sync Dues (admin)
No body. Recalculates overdue statuses.

### `GET /fees/stats` — Fee Statistics

### `GET /fees/receipt/:id` — Get Receipt Details

### `POST /fees/send-reminders` — Send Reminders to All Pending (admin)
No body.

### `POST /fees/cron/monthly` — Monthly Auto-Generation Webhook
**Header:** `x-cron-secret: <CRON_SECRET_from_env>`
No body. Reads all `frequency='monthly'` fee structures and generates next month's dues for all mapped students.

### `POST /fees/create-order` — Razorpay Online Payment Order
```json
{ "feePaymentId": "uuid" }
```

### `POST /fees/verify-payment` — Verify Razorpay Payment
```json
{ 
  "razorpay_order_id": "string",
  "razorpay_payment_id": "string",
  "razorpay_signature": "string"
}
```

### `GET /fees/dashboard` — Finance Dashboard Stats
No body.

### `GET /fees/categories` — Get Fee Categories
### `POST /fees/categories` — Create Fee Category (admin)
```json
{ "name": "Tuition", "description": "Monthly fee", "is_taxable": false }
```
### `PUT /fees/categories/:id` — Update Fee Category (admin)
### `DELETE /fees/categories/:id` — Delete Fee Category (admin)

### `GET /fees/discounts` — Get Fee Discounts
### `POST /fees/discounts` — Apply Discount (admin)
```json
{ "paymentId": "uuid", "amount": 1000, "reason": "Sibling Discount" }
```

### `GET /fees/fines` — Get Fee Fines
### `POST /fees/fines` — Add Fine (admin)
```json
{ "paymentId": "uuid", "amount": 500, "reason": "Late Fee" }
```
### `PUT /fees/fines/:id/waive` — Waive Fine (admin)

### `GET /fees/refunds` — Get Fee Refunds
### `POST /fees/refunds` — Create Refund (admin)
```json
{ "paymentId": "uuid", "amount": 2000, "reason": "Overpaid" }
```

### `GET /fees/ledger/:studentId` — Get Student Ledger
No body.

---

## 8. Exams (`/api/exams`)

### `GET /exams`
Query: `?class_id=uuid&subject_id=uuid&status=scheduled&dashboard=true`

### `GET /exams/types` — Get Exam Types
Returns: `[{ id, name, weightage }]`
> Auto-seeds defaults (Mid-Term, Final Exam, Unit Test, Mock Test) if none exist for the school.

### `POST /exams` — Create Exam (admin/teacher)
```json
{
  "name": "Mid Term Math",
  "examTypeId": "uuid",
  "classId": "uuid",
  "sectionId": "uuid",
  "subjectId": "uuid",
  "date": "2026-06-01",
  "startTime": "09:00",
  "endTime": "12:00",
  "totalMarks": 100,
  "passingMarks": 33,
  "room": "Hall A",
  "instructions": "Bring calculator",
  "academicYearId": "uuid"
}
```

### `PUT /exams/:id` — Update Exam (admin/teacher)
All fields optional. Properly maps camelCase → snake_case DB columns.

### `DELETE /exams/:id` — Delete Exam (admin)

### `POST /exams/results` — Submit Results (admin/teacher)
```json
{
  "examId": "uuid",
  "results": [
    { "studentId": "uuid", "marksObtained": 85, "isAbsent": false, "remarks": "Good" }
  ]
}
```

### `GET /exams/results/:examId` — Get Results for Exam

### `GET /exams/report-card/:studentId`
Query: `?exam_type_id=uuid`

### `POST /exams/publish` — Publish & Notify
```json
{ "examId": "uuid" }
```

---

## 9. Parents (`/api/parents`)

| Method | Endpoint | Role | Description |
|--------|----------|------|-------------|
| GET | `/parents` | admin | List all parents |
| GET | `/parents/dashboard` | parent | Parent dashboard |
| GET | `/parents/children` | parent | Linked children |
| GET | `/parents/children/:studentId/attendance` | parent | `?month=5&year=2026` |
| GET | `/parents/children/:studentId/fees` | parent | Fee history |
| GET | `/parents/children/:studentId/results` | parent | Exam results |
| GET | `/parents/notifications` | any | In-app notifications |
| POST | `/parents/messages` | any | `{ "receiverId": "uuid", "subject": "...", "content": "..." }` |
| GET | `/parents/messages` | any | Message history |

---

## 10. Communication (`/api/communication`)

### `GET /communication/logs`
Query: `?page=1&limit=100&channel=email&type=credentials`

### `POST /communication/send-email`
```json
{
  "recipientType": "class",
  "filters": { "classId": "uuid" },
  "subject": "Important Notice",
  "message": "Dear {parent_name}, ...",
  "type": "announcement"
}
```
`recipientType`: `individual` | `class` | `section` | `all`

### `POST /communication/send-receipt`
```json
{ "feePaymentId": "uuid" }
```

### `GET /communication/notifications` — Unread notifications
### `POST /communication/notifications/mark-read`
```json
{ "notificationIds": ["uuid1"] }
```

### `POST /communication/send-message`
```json
{ "receiverId": "uuid", "message": "Hello", "type": "chat" }
```

---

## 11. AI (`/api/ai`)

| Method | Endpoint | Body |
|--------|----------|------|
| GET | `/ai/sessions` | — |
| POST | `/ai/sessions` | `{ "title": "New Chat" }` |
| POST | `/ai/chat` | `{ "message": "...", "sessionId": "uuid", "language": "en" }` |
| GET | `/ai/history` | Query: `?sessionId=uuid` |
| GET | `/ai/trends` | Query: `?level=school` |
| POST | `/ai/performance-summary` | `{ "studentId": "uuid" }` |

---

## 12. Payroll (`/api/payroll`)

### `GET /payroll` — Query: `?teacher_id=uuid`
### `POST /payroll` — Create Entry (admin)
```json
{ "teacher_id": "uuid", "amount": 50000, "month": 5, "year": 2026, "status": "pending" }
```
### `POST /payroll/:id/pay` — Process Payout (admin)
```json
{ "accountNumber": "1234567890", "ifsc": "SBIN0001234" }
```

---

## 13. Inventory (`/api/inventory`) — Admin only

### `GET /inventory` — Query: `?category=books&status=low&search=chalk`
### `POST /inventory` — Upsert Item
```json
{ "name": "Whiteboard Marker", "category": "stationery", "quantity": 100, "min_stock": 20, "unit_price": 50 }
```
### `POST /inventory/bulk` — `{ "items": [{ ... }] }`
### `POST /inventory/issue` — `{ "itemId": "uuid", "userId": "uuid", "quantity": 5, "type": "student" }`
### `DELETE /inventory/:id`

---

## 14. Transport (`/api/transport`)

| Method | Endpoint | Body |
|--------|----------|------|
| GET | `/transport/vehicles` | — |
| POST | `/transport/vehicles` | `{ "number": "DL01AB1234", "capacity": 40, "driverId": "uuid" }` |
| GET | `/transport/routes` | — |
| POST | `/transport/routes` | `{ "name": "Route A", "stops": [...] }` |
| DELETE | `/transport/routes/:id` | — |
| POST | `/transport/assign` | `{ "studentId": "uuid", "routeId": "uuid" }` |
| GET | `/transport/live/:route_id` | — |

---

## 15. Library (`/api/library`)

| Method | Endpoint | Body |
|--------|----------|------|
| GET | `/library/books` | — |
| POST | `/library/books` | `{ "title": "...", "author": "...", "isbn": "...", "copies": 5 }` |
| POST | `/library/issue` | `{ "bookId": "uuid", "studentId": "uuid", "dueDate": "2026-09-01" }` |
| POST | `/library/return` | `{ "issueId": "uuid" }` |

---

## 16. Admin Settings (`/api/admin/payments`)

### `GET /admin/payments/settings` — Get Razorpay Keys
### `POST /admin/payments/settings` — Update Razorpay Keys
```json
{ "keyId": "rzp_live_...", "keySecret": "..." }
```

---

## 17. System

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | System status check |
| GET | `/admin/audit-logs?page=1&limit=50` | All admin action logs |

---

## 18. LMS & Assignments (`/api/lms`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/lms` | Get LMS data/courses |
| DELETE | `/lms/courses/:id` | Delete a course |
| POST | `/lms/assignments/results` | Submit assignment results in bulk (Marks Management) |
| POST | `/lms/assignments/publish` | Publish assignment results and notify parents |

---

## Auth Token Flow
```
1. POST /api/auth/register  →  { user, token }
2. POST /api/auth/login     →  { user, token }
3. All requests: Authorization: Bearer <token>
```

## Role Permissions

| Role | Access |
|------|--------|
| **admin** | Full CRUD — all modules, fees, timetable, payroll, inventory |
| **teacher** | Students, attendance, exams/results, assignments, leaves |
| **parent** | Own children's data, fees, attendance, results, messages |
| **student** | Own dashboard, profile, timetable, results, fees |

---

## Fee Notification Channels

Every fee action auto-fires **In-App** notifications (mandatory). Optional channels selectable by admin:

| Channel | Field |
|---------|-------|
| In-App | Always enabled |
| Email | `"notifyEmail": true` |
| WhatsApp | `"notifyWhatsapp": true` |
| SMS | `"notifySms": true` |

Notification events: `fee_generated`, `fee_reminder`, `payment_received`, `partial_payment`, `fee_overdue`, `receipt_generated`
