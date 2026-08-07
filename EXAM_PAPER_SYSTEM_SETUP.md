# Exam Paper Generation System - Setup Guide

## System Overview
A complete exam paper generation system with board-style features including internal choices, duplicate detection, blueprint compliance, and paper moderation workflow.

## Files Created/Modified

### Backend Files
1. **backend/migrations/exam_paper_system.sql** - Database schema (8 tables)
2. **backend/src/controllers/exam-paper.controller.ts** - API controller (600+ lines)
3. **backend/src/routes/exam-paper.route.ts** - Route definitions
4. **backend/src/routes.ts** - Main router (updated)

### Frontend Files
1. **frontend/src/lib/api.ts** - API client methods (updated)
2. **frontend/src/app/pages/teachers/SimpleExamPaperCreator.tsx** - Main UI (900+ lines)
3. **frontend/src/app/routes.tsx** - Routing (updated)
4. **frontend/src/app/components/layout/Sidebar.tsx** - Navigation (updated)

## Setup Instructions

### Step 1: Database Migration
Run the migration to create the required tables:

```bash
cd backend
npm run migrate exam_paper_system.sql
```

Or manually run the SQL in Supabase SQL Editor:
```bash
# Copy contents of backend/migrations/exam_paper_system.sql
# Paste into Supabase Dashboard → SQL Editor → Run
```

### Step 2: Start Backend Server
```bash
cd backend
npm run dev
```

The server should start on http://localhost:3000

### Step 3: Start Frontend
```bash
cd frontend
npm run dev
```

The frontend should start on http://localhost:5173

## Access the Application

### For Teachers:
1. Login as a teacher
2. Navigate to: **Teachers → Create Exam Paper**
3. URL: `/teachers/create-exam-paper`

### For Admins:
1. Login as an admin
2. Navigate to: **Dashboard → Exam Paper Templates**
3. URL: `/dashboard/exam-templates`

## Features

### 1. Simple 3-Step Workflow
- **Step 1**: Basic Information (class, subject, title, marks, duration)
- **Step 2**: Paper Structure (sections A, B, C, D with auto-calculated totals)
- **Step 3**: Add Questions (paste interface with auto-parsing)

### 2. Internal Choice Support
Format: `Question 5 OR Question 6` or `Question 5 | Question 6`
- Auto-detects and marks as internal choice
- Displays "(Internal Choice)" badge

### 3. Duplicate Detection
- Tracks question usage across all papers
- Shows warnings: "Already used in Midterm 2025"
- One-click duplicate check button

### 4. Paper Moderation Workflow
Statuses: Draft → Submitted → Reviewed → Approved → Locked
- Multi-reviewer support
- Comments and audit trail

### 5. Blueprint Compliance
- Define target distribution (e.g., MCQ 20%, Short 30%, Long 50%)
- Real-time validation with 5% tolerance
- Shows: "✔ Blueprint matched" or "❌ Exceeds target"

### 6. Print Options
Toggle switches for:
- Header
- Footer
- Page Numbers
- Watermark (DRAFT)
- Signature Line
- Instructions

## API Endpoints

### Templates
- `GET /exam-papers/templates` - List templates
- `POST /exam-papers/templates` - Create template

### Questions
- `GET /exam-papers/questions` - List questions
- `POST /exam-papers/questions` - Create question
- `POST /exam-papers/questions/bulk-import` - Bulk import
- `POST /exam-papers/questions/check-duplicates` - Check duplicates

### Papers
- `GET /exam-papers/papers` - List papers
- `POST /exam-papers/papers` - Create paper
- `GET /exam-papers/papers/:id/html` - Generate HTML
- `PATCH /exam-papers/papers/:id/status` - Update status
- `POST /exam-papers/papers/:id/track-usage` - Track usage

### Blueprint
- `POST /exam-papers/templates/check-blueprint` - Check compliance

## Troubleshooting

### Page Not Loading
1. **Check Backend is Running**: Ensure backend server is running on port 3000
2. **Check Database Migration**: Run the migration SQL to create tables
3. **Check Console Errors**: Open browser DevTools (F12) → Console tab
4. **Check Network Tab**: DevTools → Network tab to see failed API calls

### Common Issues

#### "Failed to load data" Error
- **Cause**: Backend not running or database tables not created
- **Solution**: 
  1. Start backend: `cd backend && npm run dev`
  2. Run migration SQL in Supabase

#### "api.getSubjects is not a function"
- **Cause**: API client not properly configured
- **Solution**: Check `frontend/src/lib/api.ts` has the getSubjects method

#### Empty dropdowns (no classes/subjects)
- **Cause**: No data in database
- **Solution**: Add classes and subjects through the admin panel first

#### Questions not saving
- **Cause**: Database tables not created
- **Solution**: Run the migration SQL

## Database Tables Created

1. `exam_paper_templates` - Paper templates
2. `exam_paper_sections` - Section configurations
3. `exam_questions` - Question bank
4. `exam_papers` - Generated papers
5. `exam_paper_questions` - Paper-question mappings
6. `exam_paper_versions` - Paper versions
7. `question_usage_history` - Duplicate detection
8. Indexes for performance

## Testing the System

### Test Data Setup
1. Create a class (e.g., "Class 10")
2. Create a subject (e.g., "Mathematics")
3. Go to Teachers → Create Exam Paper
4. Select class and subject
5. Add sections (A, B, C)
6. Add questions using paste interface
7. Preview and download

### Example Question Format
```
What is 2+2? [2 marks]
Explain photosynthesis [5 marks]
Q5 OR Q6 [10 marks]
```

## Support
For issues or questions, check the console logs in both frontend and backend.