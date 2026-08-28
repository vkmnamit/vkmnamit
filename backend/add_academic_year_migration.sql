ALTER TABLE users ADD COLUMN IF NOT EXISTS academic_year_id UUID REFERENCES academic_years(id);
