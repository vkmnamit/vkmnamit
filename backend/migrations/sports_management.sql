-- Sports Management Extension
-- 1. Create Sports Teams Table
CREATE TABLE IF NOT EXISTS sports_teams (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id UUID REFERENCES schools(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  sport_type TEXT NOT NULL, -- e.g. Football, Basketball
  coach_id UUID REFERENCES users(id),
  category TEXT, -- e.g. Under-15, Senior
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Create Team Members Table (Linking students to teams)
CREATE TABLE IF NOT EXISTS sports_team_members (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  team_id UUID REFERENCES sports_teams(id) ON DELETE CASCADE,
  student_id UUID REFERENCES students(id) ON DELETE CASCADE,
  role TEXT DEFAULT 'player', -- player, captain, vice-captain
  jersey_number INT,
  joined_at DATE DEFAULT CURRENT_DATE,
  UNIQUE(team_id, student_id)
);

-- 3. Add 'Sports' specific inventory view or link
-- (Existing school_inventory already has a 'Sports' category)
