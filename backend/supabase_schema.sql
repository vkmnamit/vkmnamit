-- ============================================
-- EduMaster School Management System
-- Supabase PostgreSQL Schema (v2.0 - SaaS Fully Optimized)
-- ============================================

-- Enable Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- 1. SCHOOLS (Multi-tenant Infrastructure)
-- ============================================
CREATE TABLE schools (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  code TEXT UNIQUE NOT NULL,
  domain TEXT UNIQUE,
  address TEXT,
  city TEXT,
  state TEXT,
  pincode TEXT,
  phone TEXT,
  email TEXT,
  website TEXT,
  logo_url TEXT,
  principal_name TEXT,
  established_year INT,
  board TEXT CHECK (board IN ('CBSE', 'ICSE', 'STATE', 'IB', 'IGCSE', 'OTHER')),
  subscription_plan TEXT DEFAULT 'free' CHECK (subscription_plan IN ('free', 'basic', 'pro', 'enterprise')),
  subscription_end_date TIMESTAMPTZ,
  settings JSONB DEFAULT '{"fee_reminder_channels": ["email", "sms", "whatsapp"], "welcome_channels": ["email"]}',
  is_active BOOLEAN DEFAULT true,
  razorpay_key_id TEXT,
  razorpay_key_secret TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 2. ACADEMIC YEARS
-- ============================================
CREATE TABLE academic_years (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id UUID REFERENCES schools(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  is_current BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 3. USERS (Core Authentication Entity)
-- ============================================
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  auth_id UUID UNIQUE, -- Links to Supabase auth.users
  school_id UUID REFERENCES schools(id) ON DELETE CASCADE,
  email TEXT UNIQUE NOT NULL,
  username TEXT UNIQUE,
  phone TEXT,
  role TEXT NOT NULL CHECK (role IN ('super_admin', 'admin', 'teacher', 'parent', 'student')),
  first_name TEXT NOT NULL,
  last_name TEXT,
  avatar_url TEXT,
  preferred_language TEXT DEFAULT 'en',
  is_active BOOLEAN DEFAULT true,
  last_login TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 4. ACADEMIC STRUCTURE (Classes, Sections, Subjects)
-- ============================================
CREATE TABLE classes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id UUID REFERENCES schools(id) ON DELETE CASCADE,
  academic_year_id UUID REFERENCES academic_years(id),
  name TEXT NOT NULL,
  grade INT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE sections (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  class_id UUID REFERENCES classes(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  class_teacher_id UUID REFERENCES users(id),
  capacity INT DEFAULT 40,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE subjects (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id UUID REFERENCES schools(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  code TEXT,
  description TEXT,
  is_elective BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE class_subjects (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  class_id UUID REFERENCES classes(id) ON DELETE CASCADE,
  subject_id UUID REFERENCES subjects(id) ON DELETE CASCADE,
  teacher_id UUID REFERENCES users(id),
  periods_per_week INT DEFAULT 5,
  UNIQUE(class_id, subject_id)
);

-- ============================================
-- 5. EXTENDED PROFILES (Students, Teachers, Parents)
-- ============================================
CREATE TABLE students (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  school_id UUID REFERENCES schools(id) ON DELETE CASCADE,
  academic_year_id UUID REFERENCES academic_years(id),
  section_id UUID REFERENCES sections(id),
  admission_number TEXT UNIQUE,
  roll_number INT,
  date_of_birth DATE,
  gender TEXT,
  blood_group TEXT,
  address TEXT,
  city TEXT,
  state TEXT,
  pincode TEXT,
  father_name TEXT,
  mother_name TEXT,
  guardian_phone TEXT,
  guardian_email TEXT,
  emergency_contact TEXT,
  medical_conditions TEXT,
  allergies TEXT,
  previous_school TEXT,
  admission_date DATE DEFAULT CURRENT_DATE,
  performance_trend JSONB DEFAULT '[]', -- Recent test scores trend
  weak_subjects TEXT[], -- Subjects where marks < 40%
  attendance_percentage DECIMAL(5,2) DEFAULT 100.00,
  risk_level TEXT DEFAULT 'low' CHECK (risk_level IN ('low', 'medium', 'high')),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE teachers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  school_id UUID REFERENCES schools(id) ON DELETE CASCADE,
  employee_id TEXT UNIQUE,
  designation TEXT,
  department TEXT,
  qualification TEXT,
  experience_years INT,
  date_of_joining DATE,
  specialization TEXT,
  salary DECIMAL(12,2),
  performance_rating DECIMAL(3,2) DEFAULT 5.0,
  workload_percentage INT DEFAULT 0, -- Calculated from periods taught
  is_class_teacher BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE parents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  school_id UUID REFERENCES schools(id) ON DELETE CASCADE,
  occupation TEXT,
  annual_income TEXT,
  engagement_score INT DEFAULT 100, -- Decreases if they miss meetings/messages
  fee_payment_history TEXT DEFAULT 'reliable' CHECK (fee_payment_history IN ('reliable', 'irregular', 'defaulter')),
  address TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE parent_students (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  parent_id UUID REFERENCES parents(id) ON DELETE CASCADE,
  student_id UUID REFERENCES students(id) ON DELETE CASCADE,
  relationship TEXT,
  UNIQUE(parent_id, student_id)
);

-- ============================================
-- 6. FINANCE & TREASURY
-- ============================================
CREATE TABLE fee_structures (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id UUID REFERENCES schools(id) ON DELETE CASCADE,
  academic_year_id UUID REFERENCES academic_years(id),
  class_id UUID REFERENCES classes(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  frequency TEXT,
  due_day INT DEFAULT 10,
  is_mandatory BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE fee_payments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id UUID REFERENCES schools(id) ON DELETE CASCADE,
  student_id UUID REFERENCES students(id) ON DELETE CASCADE,
  academic_year_id UUID REFERENCES academic_years(id) ON DELETE SET NULL,
  fee_structure_id UUID REFERENCES fee_structures(id),
  amount DECIMAL(12,2) NOT NULL,
  paid_amount DECIMAL(12,2) DEFAULT 0,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'partial', 'paid', 'overdue')),
  payment_method TEXT,
  transaction_id TEXT,
  paid_date TIMESTAMPTZ,
  receipt_number TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE fee_transactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id UUID REFERENCES schools(id) ON DELETE CASCADE,
  fee_payment_id UUID REFERENCES fee_payments(id) ON DELETE CASCADE,
  amount DECIMAL(12,2) NOT NULL,
  payment_method TEXT,
  transaction_id TEXT, -- External ID (Razorpay/Bank)
  receipt_number TEXT,
  remarks TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE inventory_categories (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id UUID REFERENCES schools(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE school_inventory (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id UUID REFERENCES schools(id) ON DELETE CASCADE,
  category_id UUID REFERENCES inventory_categories(id) ON DELETE SET NULL,
  category TEXT, -- legacy, keep for backward compatibility temporarily
  name TEXT NOT NULL,
  sku TEXT,
  barcode TEXT,
  brand TEXT,
  supplier TEXT,
  purchase_date DATE,
  purchase_cost DECIMAL(12,2),
  selling_price DECIMAL(12,2),
  quantity INT DEFAULT 0,
  min_stock INT DEFAULT 10,
  max_stock INT,
  unit_price DECIMAL(12,2), -- legacy
  unit TEXT DEFAULT 'Piece',
  location TEXT,
  shelf_number TEXT,
  warranty_details TEXT,
  expiry_date DATE,
  image_url TEXT,
  status TEXT DEFAULT 'good',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE inventory_transactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id UUID REFERENCES schools(id) ON DELETE CASCADE,
  item_id UUID REFERENCES school_inventory(id) ON DELETE CASCADE,
  transaction_type TEXT NOT NULL CHECK (transaction_type IN ('purchase', 'stock_added', 'issue', 'return', 'repair', 'damage', 'lost', 'dispose', 'adjustment')),
  quantity INT NOT NULL,
  previous_stock INT NOT NULL,
  updated_stock INT NOT NULL,
  issued_to_student_id UUID REFERENCES students(id) ON DELETE SET NULL,
  issued_to_teacher_id UUID REFERENCES teachers(id) ON DELETE SET NULL,
  performed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  remarks TEXT,
  reference_doc_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE class_inventory_requirements (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id UUID REFERENCES schools(id) ON DELETE CASCADE,
  academic_year_id UUID REFERENCES academic_years(id) ON DELETE CASCADE,
  class_id UUID REFERENCES classes(id) ON DELETE CASCADE,
  item_id UUID REFERENCES school_inventory(id) ON DELETE CASCADE,
  required_quantity INT DEFAULT 1,
  is_mandatory BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE student_inventory_distribution (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id UUID REFERENCES schools(id) ON DELETE CASCADE,
  academic_year_id UUID REFERENCES academic_years(id) ON DELETE CASCADE,
  student_id UUID REFERENCES students(id) ON DELETE CASCADE,
  item_id UUID REFERENCES school_inventory(id) ON DELETE CASCADE,
  quantity INT DEFAULT 1,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'issued', 'returned', 'lost', 'damaged', 'replaced')),
  issue_date TIMESTAMPTZ,
  expected_return_date DATE,
  actual_return_date TIMESTAMPTZ,
  fee_payment_id UUID REFERENCES fee_payments(id) ON DELETE SET NULL,
  receipt_number TEXT,
  remarks TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE teacher_payroll (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id UUID REFERENCES schools(id) ON DELETE CASCADE,
  teacher_id UUID REFERENCES users(id) ON DELETE CASCADE,
  amount DECIMAL(12,2) NOT NULL,
  month TEXT NOT NULL,
  year TEXT NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'paid', 'failed')),
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE school_expenses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id UUID REFERENCES schools(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  category TEXT,
  amount DECIMAL(12,2) NOT NULL,
  status TEXT DEFAULT 'cleared',
  date DATE DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 7. ACADEMIC OPERATIONS (Attendance, Exams, Timetable)
-- ============================================
CREATE TABLE attendance (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id UUID REFERENCES schools(id) ON DELETE CASCADE,
  student_id UUID REFERENCES students(id) ON DELETE CASCADE,
  section_id UUID REFERENCES sections(id),
  date DATE NOT NULL,
  status TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(student_id, date)
);

CREATE TABLE exam_types (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id UUID REFERENCES schools(id) ON DELETE CASCADE,
  name TEXT NOT NULL, -- Mid-Term, Final, Mock, Unit Test
  weightage INT DEFAULT 100,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE exams (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id UUID REFERENCES schools(id) ON DELETE CASCADE,
  exam_type_id UUID REFERENCES exam_types(id),
  academic_year_id UUID REFERENCES academic_years(id),
  class_id UUID REFERENCES classes(id),
  subject_id UUID REFERENCES subjects(id),
  name TEXT NOT NULL,
  date DATE,
  start_time TIME,
  end_time TIME,
  total_marks DECIMAL(6,2),
  passing_marks DECIMAL(6,2),
  room TEXT,
  invigilator_id UUID REFERENCES users(id),
  status TEXT DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'ongoing', 'completed', 'cancelled')),
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE exam_results (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  exam_id UUID REFERENCES exams(id) ON DELETE CASCADE,
  student_id UUID REFERENCES students(id) ON DELETE CASCADE,
  marks_obtained DECIMAL(6,2),
  grade TEXT,
  is_absent BOOLEAN DEFAULT false,
  remarks TEXT,
  evaluated_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(exam_id, student_id)
);

CREATE TABLE timetable_slots (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id UUID REFERENCES schools(id) ON DELETE CASCADE,
  section_id UUID REFERENCES sections(id),
  subject_id UUID REFERENCES subjects(id),
  teacher_id UUID REFERENCES users(id),
  day_of_week INT,
  period_number INT,
  start_time TIME,
  end_time TIME,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(section_id, day_of_week, period_number)
);

-- ============================================
-- 8. SYSTEM LOGS & ANALYTICS
-- ============================================
CREATE TABLE notification_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id UUID REFERENCES schools(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id),
  channel TEXT,
  type TEXT,
  message TEXT NOT NULL,
  recipient TEXT,
  status TEXT DEFAULT 'sent',
  metadata JSONB,
  is_read BOOLEAN DEFAULT false,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id UUID REFERENCES schools(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id),
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- PERFORMANCE INDEXES
-- ============================================
CREATE INDEX idx_users_school ON users(school_id);
CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_students_section ON students(section_id);
CREATE INDEX idx_attendance_date ON attendance(date);
CREATE INDEX idx_fee_payments_status ON fee_payments(status);
CREATE INDEX idx_inventory_school ON school_inventory(school_id);
CREATE INDEX idx_payroll_school ON teacher_payroll(school_id);

-- ============================================
-- FUNCTIONS & TRIGGERS
-- ============================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_schools_updated_at BEFORE UPDATE ON schools FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_students_updated_at BEFORE UPDATE ON students FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_teachers_updated_at BEFORE UPDATE ON teachers FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_inventory_updated_at BEFORE UPDATE ON school_inventory FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================
-- 9. AI CHAT HISTORY
-- ============================================

CREATE TABLE chat_messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 10. CANTEEN & ORDERS
-- ============================================
CREATE TABLE canteen_menu (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id UUID REFERENCES schools(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  price DECIMAL(10,2) NOT NULL,
  category TEXT,
  available BOOLEAN DEFAULT true,
  image TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE canteen_orders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id UUID REFERENCES schools(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  total_amount DECIMAL(10,2) NOT NULL,
  status TEXT DEFAULT 'completed',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE canteen_order_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id UUID REFERENCES canteen_orders(id) ON DELETE CASCADE,
  menu_item_id UUID REFERENCES canteen_menu(id) ON DELETE CASCADE,
  quantity INT NOT NULL,
  price_at_time DECIMAL(10,2) NOT NULL
);

-- ============================================
-- 11. LMS & COURSES
-- ============================================
CREATE TABLE lms_courses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id UUID REFERENCES schools(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  instructor_id UUID REFERENCES users(id),
  lessons INT DEFAULT 0,
  students INT DEFAULT 0,
  progress INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE lms_assignments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  course_id UUID REFERENCES lms_courses(id) ON DELETE CASCADE,
  school_id UUID REFERENCES schools(id) ON DELETE CASCADE,
  section_id UUID REFERENCES sections(id) ON DELETE CASCADE,
  subject_id UUID REFERENCES subjects(id) ON DELETE CASCADE,
  teacher_id UUID REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  due_date DATE,
  submissions INT DEFAULT 0,
  total INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 12. COMPETITIONS & EVENTS
-- ============================================
CREATE TABLE competitions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id UUID REFERENCES schools(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  category TEXT,
  date DATE,
  status TEXT DEFAULT 'upcoming',
  participants INT DEFAULT 0,
  prize TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id UUID REFERENCES schools(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  date DATE,
  time TEXT,
  location TEXT,
  type TEXT,
  status TEXT DEFAULT 'upcoming',
  attendees INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 13. TRANSPORT & LOGISTICS
-- ============================================
CREATE TABLE transport_vehicles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id UUID REFERENCES schools(id) ON DELETE CASCADE,
  vehicle_number TEXT NOT NULL,
  driver_name TEXT NOT NULL,
  driver_phone TEXT,
  capacity INT,
  gps_id TEXT, -- For real-time tracking
  status TEXT DEFAULT 'active'
);

CREATE TABLE transport_routes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id UUID REFERENCES schools(id) ON DELETE CASCADE,
  route_name TEXT NOT NULL,
  vehicle_id UUID REFERENCES transport_vehicles(id),
  pickup_points JSONB, -- Array of stops with timing
  monthly_fee DECIMAL(10,2)
);

ALTER TABLE students ADD COLUMN transport_route_id UUID REFERENCES transport_routes(id);

-- ============================================
-- 14. LIBRARY MANAGEMENT
-- ============================================
CREATE TABLE library_books (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id UUID REFERENCES schools(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  author TEXT,
  isbn TEXT,
  category TEXT,
  total_copies INT DEFAULT 1,
  available_copies INT DEFAULT 1,
  shelf_location TEXT
);

CREATE TABLE library_issues (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  book_id UUID REFERENCES library_books(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  issue_date DATE DEFAULT CURRENT_DATE,
  due_date DATE,
  return_date DATE,
  fine_amount DECIMAL(10,2) DEFAULT 0,
  status TEXT DEFAULT 'issued' CHECK (status IN ('issued', 'returned', 'overdue'))
);

-- ============================================
-- 15. ADVANCED LMS (Submissions)
-- ============================================
CREATE TABLE lms_submissions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  assignment_id UUID REFERENCES lms_assignments(id) ON DELETE CASCADE,
  student_id UUID REFERENCES students(id) ON DELETE CASCADE,
  content_url TEXT, -- Link to PDF/Doc
  submission_date TIMESTAMPTZ DEFAULT NOW(),
  marks_obtained DECIMAL(5,2),
  feedback TEXT,
  status TEXT DEFAULT 'submitted' CHECK (status IN ('submitted', 'graded', 'late', 'assigned', 'pending', 'completed'))
);

-- ============================================
-- 16. GRANULAR FINANCE (Fee Components)
-- ============================================
CREATE TABLE fee_heads (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id UUID REFERENCES schools(id) ON DELETE CASCADE,
  name TEXT NOT NULL, -- Tuition, Transport, Lab, Library, Annual
  is_recurring BOOLEAN DEFAULT true
);

CREATE TABLE fee_component_values (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  fee_structure_id UUID REFERENCES fee_structures(id) ON DELETE CASCADE,
  fee_head_id UUID REFERENCES fee_heads(id) ON DELETE CASCADE,
  amount DECIMAL(12,2) NOT NULL
);

-- ============================================
-- 17. DIGITAL DOCUMENT VAULT (KYC & Academic)
-- ============================================
CREATE TABLE document_vault (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id UUID REFERENCES schools(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  document_type TEXT NOT NULL, -- Aadhar, Marksheet, Transfer Certificate, Appointment Letter
  file_url TEXT NOT NULL,
  status TEXT DEFAULT 'verified',
  uploaded_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 18. SUPPORT QUERIES & HELPDESK
-- ============================================
CREATE TABLE support_queries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id UUID REFERENCES schools(id) ON DELETE CASCADE,
  ticket_number TEXT NOT NULL,
  raised_by_user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  raised_by_role TEXT NOT NULL CHECK (raised_by_role IN ('student', 'parent', 'teacher')),
  student_id UUID REFERENCES students(id) ON DELETE SET NULL,
  category TEXT DEFAULT 'general',
  subject TEXT NOT NULL,
  description TEXT NOT NULL,
  priority TEXT DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  status TEXT DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved', 'closed')),
  assigned_to UUID REFERENCES users(id) ON DELETE SET NULL,
  closed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE query_replies (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  query_id UUID REFERENCES support_queries(id) ON DELETE CASCADE,
  sender_id UUID REFERENCES users(id) ON DELETE CASCADE,
  sender_role TEXT NOT NULL,
  message TEXT NOT NULL,
  attachments JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ==========================================
-- ACADEMIC PLANNERS & ASSEMBLIES MODULE
-- ==========================================

-- Lecture Plans
CREATE TABLE lecture_plans (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id UUID REFERENCES schools(id) ON DELETE CASCADE,
  academic_year_id UUID REFERENCES academic_years(id) ON DELETE CASCADE,
  class_id UUID REFERENCES classes(id) ON DELETE CASCADE,
  section_id UUID REFERENCES sections(id) ON DELETE CASCADE,
  subject_id UUID REFERENCES subjects(id) ON DELETE CASCADE,
  teacher_id UUID REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  chapter TEXT,
  topic TEXT,
  description TEXT,
  date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  room TEXT,
  meeting_link TEXT,
  resources TEXT,
  homework TEXT,
  priority TEXT DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high')),
  status TEXT DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'completed', 'cancelled', 'rescheduled')),
  remarks TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Academic Assessments
CREATE TABLE academic_assessments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id UUID REFERENCES schools(id) ON DELETE CASCADE,
  academic_year_id UUID REFERENCES academic_years(id) ON DELETE CASCADE,
  class_id UUID REFERENCES classes(id) ON DELETE CASCADE,
  section_id UUID REFERENCES sections(id) ON DELETE CASCADE,
  subject_id UUID REFERENCES subjects(id) ON DELETE CASCADE,
  teacher_id UUID REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('homework', 'assignment', 'class_test', 'unit_test', 'project', 'exam', 'practical', 'viva', 'other')),
  title TEXT NOT NULL,
  description TEXT,
  total_marks DECIMAL(6,2),
  passing_marks DECIMAL(6,2),
  weightage INT DEFAULT 100,
  assigned_date DATE,
  due_date DATE,
  eval_date DATE,
  result_date DATE,
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'completed', 'cancelled')),
  attachments TEXT,
  instructions TEXT,
  rubrics TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Assessment Submissions
CREATE TABLE assessment_submissions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  assessment_id UUID REFERENCES academic_assessments(id) ON DELETE CASCADE,
  student_id UUID REFERENCES students(id) ON DELETE CASCADE,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'submitted', 'late', 'graded', 'excused')),
  submitted_at TIMESTAMPTZ,
  marks_obtained DECIMAL(6,2),
  teacher_feedback TEXT,
  attachments TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(assessment_id, student_id)
);

-- Assemblies
CREATE TABLE assemblies (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id UUID REFERENCES schools(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  venue TEXT,
  type TEXT DEFAULT 'regular' CHECK (type IN ('regular', 'special', 'national_event', 'festival', 'annual_function', 'awareness')),
  theme TEXT,
  dress_code TEXT,
  instructions TEXT,
  status TEXT DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'ongoing', 'completed', 'cancelled')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Assembly Activities
CREATE TABLE assembly_activities (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  assembly_id UUID REFERENCES assemblies(id) ON DELETE CASCADE,
  sequence_order INT NOT NULL,
  activity_name TEXT NOT NULL,
  assigned_to_type TEXT CHECK (assigned_to_type IN ('student', 'teacher', 'class', 'house', 'club', 'guest')),
  assigned_to_id UUID,
  assigned_to_name TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'skipped')),
  remarks TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE inventory_kits (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id UUID REFERENCES schools(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE inventory_kit_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  kit_id UUID REFERENCES inventory_kits(id) ON DELETE CASCADE,
  item_id UUID REFERENCES school_inventory(id) ON DELETE CASCADE,
  quantity INT DEFAULT 1
);

CREATE TABLE bulk_inventory_operations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id UUID REFERENCES schools(id) ON DELETE CASCADE,
  class_id UUID REFERENCES classes(id) ON DELETE SET NULL,
  section_id UUID REFERENCES sections(id) ON DELETE SET NULL,
  kit_id UUID REFERENCES inventory_kits(id) ON DELETE SET NULL,
  status TEXT DEFAULT 'completed' CHECK (status IN ('completed', 'undone')),
  student_count INT DEFAULT 0,
  performed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE inventory_transactions ADD COLUMN bulk_operation_id UUID REFERENCES bulk_inventory_operations(id) ON DELETE SET NULL;
ALTER TABLE student_inventory_distribution ADD COLUMN bulk_operation_id UUID REFERENCES bulk_inventory_operations(id) ON DELETE SET NULL;
ALTER TABLE fee_payments ADD COLUMN bulk_operation_id UUID REFERENCES bulk_inventory_operations(id) ON DELETE SET NULL;
-- ==========================================
-- COMPREHENSIVE DATABASE INDEXING
-- Run this in Supabase SQL Editor
-- ==========================================

-- Core School/Student Relations
CREATE INDEX IF NOT EXISTS idx_students_school ON students(school_id);
CREATE INDEX IF NOT EXISTS idx_students_user ON students(user_id);
CREATE INDEX IF NOT EXISTS idx_teachers_user ON teachers(user_id);
CREATE INDEX IF NOT EXISTS idx_classes_school ON classes(school_id);
CREATE INDEX IF NOT EXISTS idx_sections_class ON sections(class_id);

-- Attendance (High Volume)
CREATE INDEX IF NOT EXISTS idx_attendance_student ON attendance(student_id);
CREATE INDEX IF NOT EXISTS idx_attendance_school_date ON attendance(school_id, date);

-- Fees & Payments (High Volume)
CREATE INDEX IF NOT EXISTS idx_fee_payments_student ON fee_payments(student_id);
CREATE INDEX IF NOT EXISTS idx_fee_payments_school ON fee_payments(school_id);
CREATE INDEX IF NOT EXISTS idx_fee_payments_bulk_op ON fee_payments(bulk_operation_id);

-- Inventory Core
CREATE INDEX IF NOT EXISTS idx_school_inventory_status ON school_inventory(status);
CREATE INDEX IF NOT EXISTS idx_inventory_categories_school ON inventory_categories(school_id);

-- Inventory Transactions (High Volume)
CREATE INDEX IF NOT EXISTS idx_inventory_transactions_school ON inventory_transactions(school_id);
CREATE INDEX IF NOT EXISTS idx_inventory_transactions_item ON inventory_transactions(item_id);
CREATE INDEX IF NOT EXISTS idx_inventory_transactions_type ON inventory_transactions(transaction_type);
CREATE INDEX IF NOT EXISTS idx_inventory_transactions_student ON inventory_transactions(issued_to_student_id);
CREATE INDEX IF NOT EXISTS idx_inventory_transactions_bulk_op ON inventory_transactions(bulk_operation_id);
CREATE INDEX IF NOT EXISTS idx_inventory_transactions_created_at ON inventory_transactions(created_at DESC);

-- Inventory Distribution (High Volume)
CREATE INDEX IF NOT EXISTS idx_student_inv_dist_student ON student_inventory_distribution(student_id);
CREATE INDEX IF NOT EXISTS idx_student_inv_dist_item ON student_inventory_distribution(item_id);
CREATE INDEX IF NOT EXISTS idx_student_inv_dist_status ON student_inventory_distribution(status);
CREATE INDEX IF NOT EXISTS idx_student_inv_dist_bulk_op ON student_inventory_distribution(bulk_operation_id);

-- Enterprise Bulk Issue (New Tables)
CREATE INDEX IF NOT EXISTS idx_inventory_kits_school ON inventory_kits(school_id);
CREATE INDEX IF NOT EXISTS idx_inventory_kit_items_kit ON inventory_kit_items(kit_id);
CREATE INDEX IF NOT EXISTS idx_bulk_inv_ops_school ON bulk_inventory_operations(school_id);
CREATE INDEX IF NOT EXISTS idx_bulk_inv_ops_class_section ON bulk_inventory_operations(class_id, section_id);
CREATE INDEX IF NOT EXISTS idx_bulk_inv_ops_status ON bulk_inventory_operations(status);

-- Timetable & Academic
CREATE INDEX IF NOT EXISTS idx_timetable_section ON timetable_slots(section_id);
CREATE INDEX IF NOT EXISTS idx_timetable_teacher ON timetable_slots(teacher_id);
CREATE INDEX IF NOT EXISTS idx_timetable_day ON timetable_slots(day_of_week);

-- Exams & Results
CREATE INDEX IF NOT EXISTS idx_exams_class ON exams(class_id);
CREATE INDEX IF NOT EXISTS idx_exams_subject ON exams(subject_id);
CREATE INDEX IF NOT EXISTS idx_exam_results_exam ON exam_results(exam_id);
CREATE INDEX IF NOT EXISTS idx_exam_results_student ON exam_results(student_id);

ALTER TABLE lecture_plans ADD COLUMN IF NOT EXISTS chapter_start_date DATE;
ALTER TABLE lecture_plans ADD COLUMN IF NOT EXISTS chapter_end_date DATE;
