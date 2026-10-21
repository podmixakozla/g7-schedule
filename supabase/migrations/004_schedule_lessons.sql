-- =====================================================
-- Schedule Lessons Table
-- Stores all lesson data as single source of truth.
-- =====================================================

CREATE TABLE IF NOT EXISTS schedule_lessons (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  day_of_week smallint NOT NULL CHECK (day_of_week BETWEEN 1 AND 5),
  pair_number smallint NOT NULL CHECK (pair_number BETWEEN 1 AND 8),
  group_code text NOT NULL DEFAULT 'AR-26-1',
  subject text NOT NULL DEFAULT '-',
  teacher text NOT NULL DEFAULT '',
  classroom text NOT NULL DEFAULT '',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Ensure group_code exists on already-created tables
ALTER TABLE schedule_lessons
  ADD COLUMN IF NOT EXISTS group_code text NOT NULL DEFAULT 'AR-26-1';

-- Unique constraint: one lesson per (day_of_week, pair_number, group_code)
-- This prevents duplicate lessons and allows upsert.
DROP INDEX IF EXISTS idx_schedule_lessons_day_pair;
CREATE UNIQUE INDEX IF NOT EXISTS idx_schedule_lessons_day_pair_group
  ON schedule_lessons (day_of_week, pair_number, group_code);

-- =====================================================
-- RLS Policies
-- Public read: everyone sees the schedule.
-- NO INSERT/UPDATE/DELETE via client: only admin Edge Functions (service role).
-- =====================================================
ALTER TABLE schedule_lessons ENABLE ROW LEVEL SECURITY;

-- Public read
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE policyname = 'Public read schedule_lessons'
    AND tablename = 'schedule_lessons'
  ) THEN
    CREATE POLICY "Public read schedule_lessons" ON schedule_lessons
      FOR SELECT USING (true);
  END IF;
END $$;

-- No direct INSERT from client
-- (no INSERT policy means anonymous/authenticated cannot insert)

-- No direct UPDATE from client
-- (no UPDATE policy means anonymous/authenticated cannot update)

-- No direct DELETE from client
-- (no DELETE policy means anonymous/authenticated cannot delete)

-- =====================================================
-- Seed data: current hardcoded schedule from js/data.js
-- This ensures backward compatibility during migration.
-- =====================================================

INSERT INTO schedule_lessons (day_of_week, pair_number, subject, teacher, classroom) VALUES
  (1, 1, '-', '', ''),
  (1, 2, 'Цивілізаційні процеси в укр. суспільстві', 'Первий', ''),
  (1, 3, 'Вступ до фаху', 'Новицький', ''),
  (1, 4, 'Вступ до фаху', 'Новицький', ''),
  (2, 1, 'Фізична культура і спорт', 'Поки невідомо', ''),
  (2, 2, 'Інженерна та комп''ютерна графіка', 'Довгаль', ''),
  (2, 3, 'Фізика', 'Куцева', ''),
  (2, 4, 'Фізика', 'Куцева', ''),
  (3, 1, '-', '', ''),
  (3, 2, 'Іноземна мова', 'Поки невідомо', ''),
  (3, 3, 'Вища математика', 'Уланова', ''),
  (3, 4, 'Інженерна та комп''ютерна графіка', 'Довгаль', ''),
  (4, 1, '-', '', ''),
  (4, 2, 'Вища математика', 'Клименко', ''),
  (4, 3, 'Комп''ютерні технології та програмування', 'Колісниченко', ''),
  (4, 4, 'Комп''ютерні технології та програмування', 'Колісниченко', ''),
  (5, 1, 'Цивілізаційні процеси в укр. суспільстві', 'Первий', ''),
  (5, 2, '-', '', ''),
  (5, 3, '-', '', ''),
  (5, 4, 'Цивілізаційні процеси в укр. суспільстві', 'Первий', '')
ON CONFLICT (day_of_week, pair_number, group_code) DO NOTHING;
