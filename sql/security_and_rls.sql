-- ==============================================================================
-- ÖDEV TAKİP SİSTEMİ - SUPABASE GÜVENLİK VE ROW LEVEL SECURITY (RLS) POLİTİKALARI
-- ==============================================================================
-- Bu SQL scripti, Supabase SQL Editor üzerinden çalıştırılmak üzere hazırlanmıştır.
-- Amaç:
-- 1. Tüm tablolarda Row Level Security (RLS) özelliğini aktif hale getirmek.
-- 2. Çok kiracılı (multi-tenant) veri izolasyonu sağlamak: Her öğretmen yalnızca
--    kendi sınıflarını (owner_id = auth.uid()) ve bu sınıflara bağlı öğrenci, not,
--    ödev ve rehberlik verilerini görüntüleyebilir, düzenleyebilir ve silebilir.
-- 3. YÖNETİCİ (ADMIN) MODU: 'admin@takip.local' veya admin rolündeki kullanıcı
--    tüm öğretmenlerin sınıflarını ve verilerini SALT OKUNUR (READ-ONLY) olarak görebilir,
--    ancak hiçbir değişiklik (INSERT, UPDATE, DELETE) yapamaz.
-- 4. Yetkisiz veri erişimini ve IDOR zafiyetlerini veritabanı seviyesinde önlemek.
-- 5. Performansı artırmak için yabancı anahtar indekslerini eklemek.
-- ==============================================================================

BEGIN;

-- ------------------------------------------------------------------------------
-- 1. TABLOLARDA RLS'İ AKTİF ET
-- ------------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.classes ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.students ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.homeworks ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.homework_status ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.quizzes ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.quiz_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.performance_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.rubrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.rubric_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.deneme_exams ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.deneme_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.counseling_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.university_goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.abroad_consulting ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.class_evaluations ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.class_evaluation_marks ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.activity_log ENABLE ROW LEVEL SECURITY;

-- ------------------------------------------------------------------------------
-- 2. ESKİ POLİTİKALARI TEMİZLE (ÇAKIŞMAYI ÖNLEMEK İÇİN)
-- ------------------------------------------------------------------------------
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN (
        SELECT schemaname, tablename, policyname
        FROM pg_policies
        WHERE schemaname = 'public' AND tablename IN (
            'classes', 'students', 'homeworks', 'homework_status', 'quizzes',
            'quiz_scores', 'performance_tasks', 'rubrics', 'rubric_scores',
            'deneme_exams', 'deneme_scores', 'counseling_notes', 'university_goals',
            'abroad_consulting', 'class_evaluations', 'class_evaluation_marks',
            'activity_log'
        )
    ) LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I;', r.policyname, r.schemaname, r.tablename);
    END LOOP;
END $$;

-- ------------------------------------------------------------------------------
-- 2.1. YÖNETİCİ (ADMIN) TESPİT FONKSİYONU
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT (coalesce(auth.jwt() ->> 'email', '') = 'admin@takip.local')
      OR (coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'admin');
$$;

-- ------------------------------------------------------------------------------
-- 3. CLASSES (SINIFLAR) POLİTİKALARI
-- ------------------------------------------------------------------------------
-- Öğretmen kendi sınıflarını, admin ise TÜM sınıfları okuyabilir
CREATE POLICY "classes_select" ON public.classes
    FOR SELECT TO authenticated
    USING (owner_id = auth.uid() OR public.is_admin());

-- Sadece sınıfın gerçek sahibi öğretmen ekleyebilir/güncelleyebilir/silebilir (Admin salt okunurdur)
CREATE POLICY "classes_insert" ON public.classes
    FOR INSERT TO authenticated
    WITH CHECK (owner_id = auth.uid() AND NOT public.is_admin());

CREATE POLICY "classes_update" ON public.classes
    FOR UPDATE TO authenticated
    USING (owner_id = auth.uid() AND NOT public.is_admin())
    WITH CHECK (owner_id = auth.uid() AND NOT public.is_admin());

CREATE POLICY "classes_delete" ON public.classes
    FOR DELETE TO authenticated
    USING (owner_id = auth.uid() AND NOT public.is_admin());

-- ------------------------------------------------------------------------------
-- 4. SINIF BAZLI TABLOLAR (class_id ile bağlı olanlar)
-- ------------------------------------------------------------------------------

-- STUDENTS
CREATE POLICY "students_select" ON public.students
    FOR SELECT TO authenticated
    USING (class_id IN (SELECT id FROM public.classes WHERE owner_id = auth.uid()) OR public.is_admin());

CREATE POLICY "students_modify" ON public.students
    FOR ALL TO authenticated
    USING (class_id IN (SELECT id FROM public.classes WHERE owner_id = auth.uid()) AND NOT public.is_admin())
    WITH CHECK (class_id IN (SELECT id FROM public.classes WHERE owner_id = auth.uid()) AND NOT public.is_admin());

-- HOMEWORKS
CREATE POLICY "homeworks_select" ON public.homeworks
    FOR SELECT TO authenticated
    USING (class_id IN (SELECT id FROM public.classes WHERE owner_id = auth.uid()) OR public.is_admin());

CREATE POLICY "homeworks_modify" ON public.homeworks
    FOR ALL TO authenticated
    USING (class_id IN (SELECT id FROM public.classes WHERE owner_id = auth.uid()) AND NOT public.is_admin())
    WITH CHECK (class_id IN (SELECT id FROM public.classes WHERE owner_id = auth.uid()) AND NOT public.is_admin());

-- QUIZZES
CREATE POLICY "quizzes_select" ON public.quizzes
    FOR SELECT TO authenticated
    USING (class_id IN (SELECT id FROM public.classes WHERE owner_id = auth.uid()) OR public.is_admin());

CREATE POLICY "quizzes_modify" ON public.quizzes
    FOR ALL TO authenticated
    USING (class_id IN (SELECT id FROM public.classes WHERE owner_id = auth.uid()) AND NOT public.is_admin())
    WITH CHECK (class_id IN (SELECT id FROM public.classes WHERE owner_id = auth.uid()) AND NOT public.is_admin());

-- PERFORMANCE_TASKS
CREATE POLICY "performance_tasks_select" ON public.performance_tasks
    FOR SELECT TO authenticated
    USING (class_id IN (SELECT id FROM public.classes WHERE owner_id = auth.uid()) OR public.is_admin());

CREATE POLICY "performance_tasks_modify" ON public.performance_tasks
    FOR ALL TO authenticated
    USING (class_id IN (SELECT id FROM public.classes WHERE owner_id = auth.uid()) AND NOT public.is_admin())
    WITH CHECK (class_id IN (SELECT id FROM public.classes WHERE owner_id = auth.uid()) AND NOT public.is_admin());

-- RUBRICS
CREATE POLICY "rubrics_select" ON public.rubrics
    FOR SELECT TO authenticated
    USING (class_id IN (SELECT id FROM public.classes WHERE owner_id = auth.uid()) OR public.is_admin());

CREATE POLICY "rubrics_modify" ON public.rubrics
    FOR ALL TO authenticated
    USING (class_id IN (SELECT id FROM public.classes WHERE owner_id = auth.uid()) AND NOT public.is_admin())
    WITH CHECK (class_id IN (SELECT id FROM public.classes WHERE owner_id = auth.uid()) AND NOT public.is_admin());

-- DENEME_EXAMS
CREATE POLICY "deneme_exams_select" ON public.deneme_exams
    FOR SELECT TO authenticated
    USING (class_id IN (SELECT id FROM public.classes WHERE owner_id = auth.uid()) OR public.is_admin());

CREATE POLICY "deneme_exams_modify" ON public.deneme_exams
    FOR ALL TO authenticated
    USING (class_id IN (SELECT id FROM public.classes WHERE owner_id = auth.uid()) AND NOT public.is_admin())
    WITH CHECK (class_id IN (SELECT id FROM public.classes WHERE owner_id = auth.uid()) AND NOT public.is_admin());

-- CLASS_EVALUATIONS
CREATE POLICY "class_evaluations_select" ON public.class_evaluations
    FOR SELECT TO authenticated
    USING (class_id IN (SELECT id FROM public.classes WHERE owner_id = auth.uid()) OR public.is_admin());

CREATE POLICY "class_evaluations_modify" ON public.class_evaluations
    FOR ALL TO authenticated
    USING (class_id IN (SELECT id FROM public.classes WHERE owner_id = auth.uid()) AND NOT public.is_admin())
    WITH CHECK (class_id IN (SELECT id FROM public.classes WHERE owner_id = auth.uid()) AND NOT public.is_admin());

-- ------------------------------------------------------------------------------
-- 5. ÖĞRENCİ BAZLI TABLOLAR (student_id ile bağlı olanlar)
-- ------------------------------------------------------------------------------

-- HOMEWORK_STATUS
CREATE POLICY "homework_status_select" ON public.homework_status
    FOR SELECT TO authenticated
    USING (student_id IN (
        SELECT s.id FROM public.students s
        JOIN public.classes c ON s.class_id = c.id
        WHERE c.owner_id = auth.uid()
    ) OR public.is_admin());

CREATE POLICY "homework_status_modify" ON public.homework_status
    FOR ALL TO authenticated
    USING (student_id IN (
        SELECT s.id FROM public.students s
        JOIN public.classes c ON s.class_id = c.id
        WHERE c.owner_id = auth.uid()
    ) AND NOT public.is_admin())
    WITH CHECK (student_id IN (
        SELECT s.id FROM public.students s
        JOIN public.classes c ON s.class_id = c.id
        WHERE c.owner_id = auth.uid()
    ) AND NOT public.is_admin());

-- QUIZ_SCORES
CREATE POLICY "quiz_scores_select" ON public.quiz_scores
    FOR SELECT TO authenticated
    USING (student_id IN (
        SELECT s.id FROM public.students s
        JOIN public.classes c ON s.class_id = c.id
        WHERE c.owner_id = auth.uid()
    ) OR public.is_admin());

CREATE POLICY "quiz_scores_modify" ON public.quiz_scores
    FOR ALL TO authenticated
    USING (student_id IN (
        SELECT s.id FROM public.students s
        JOIN public.classes c ON s.class_id = c.id
        WHERE c.owner_id = auth.uid()
    ) AND NOT public.is_admin())
    WITH CHECK (student_id IN (
        SELECT s.id FROM public.students s
        JOIN public.classes c ON s.class_id = c.id
        WHERE c.owner_id = auth.uid()
    ) AND NOT public.is_admin());

-- RUBRIC_SCORES
CREATE POLICY "rubric_scores_select" ON public.rubric_scores
    FOR SELECT TO authenticated
    USING (student_id IN (
        SELECT s.id FROM public.students s
        JOIN public.classes c ON s.class_id = c.id
        WHERE c.owner_id = auth.uid()
    ) OR public.is_admin());

CREATE POLICY "rubric_scores_modify" ON public.rubric_scores
    FOR ALL TO authenticated
    USING (student_id IN (
        SELECT s.id FROM public.students s
        JOIN public.classes c ON s.class_id = c.id
        WHERE c.owner_id = auth.uid()
    ) AND NOT public.is_admin())
    WITH CHECK (student_id IN (
        SELECT s.id FROM public.students s
        JOIN public.classes c ON s.class_id = c.id
        WHERE c.owner_id = auth.uid()
    ) AND NOT public.is_admin());

-- COUNSELING_NOTES (Hassas Rehberlik Notları)
CREATE POLICY "counseling_notes_select" ON public.counseling_notes
    FOR SELECT TO authenticated
    USING (student_id IN (
        SELECT s.id FROM public.students s
        JOIN public.classes c ON s.class_id = c.id
        WHERE c.owner_id = auth.uid()
    ) OR public.is_admin());

CREATE POLICY "counseling_notes_modify" ON public.counseling_notes
    FOR ALL TO authenticated
    USING (student_id IN (
        SELECT s.id FROM public.students s
        JOIN public.classes c ON s.class_id = c.id
        WHERE c.owner_id = auth.uid()
    ) AND NOT public.is_admin())
    WITH CHECK (student_id IN (
        SELECT s.id FROM public.students s
        JOIN public.classes c ON s.class_id = c.id
        WHERE c.owner_id = auth.uid()
    ) AND NOT public.is_admin());

-- UNIVERSITY_GOALS (Üniversite Hedefleri)
CREATE POLICY "university_goals_select" ON public.university_goals
    FOR SELECT TO authenticated
    USING (student_id IN (
        SELECT s.id FROM public.students s
        JOIN public.classes c ON s.class_id = c.id
        WHERE c.owner_id = auth.uid()
    ) OR public.is_admin());

CREATE POLICY "university_goals_modify" ON public.university_goals
    FOR ALL TO authenticated
    USING (student_id IN (
        SELECT s.id FROM public.students s
        JOIN public.classes c ON s.class_id = c.id
        WHERE c.owner_id = auth.uid()
    ) AND NOT public.is_admin())
    WITH CHECK (student_id IN (
        SELECT s.id FROM public.students s
        JOIN public.classes c ON s.class_id = c.id
        WHERE c.owner_id = auth.uid()
    ) AND NOT public.is_admin());

-- ABROAD_CONSULTING (Yurtdışı Danışmanlık)
CREATE POLICY "abroad_consulting_select" ON public.abroad_consulting
    FOR SELECT TO authenticated
    USING (student_id IN (
        SELECT s.id FROM public.students s
        JOIN public.classes c ON s.class_id = c.id
        WHERE c.owner_id = auth.uid()
    ) OR public.is_admin());

CREATE POLICY "abroad_consulting_modify" ON public.abroad_consulting
    FOR ALL TO authenticated
    USING (student_id IN (
        SELECT s.id FROM public.students s
        JOIN public.classes c ON s.class_id = c.id
        WHERE c.owner_id = auth.uid()
    ) AND NOT public.is_admin())
    WITH CHECK (student_id IN (
        SELECT s.id FROM public.students s
        JOIN public.classes c ON s.class_id = c.id
        WHERE c.owner_id = auth.uid()
    ) AND NOT public.is_admin());

-- CLASS_EVALUATION_MARKS
CREATE POLICY "class_evaluation_marks_select" ON public.class_evaluation_marks
    FOR SELECT TO authenticated
    USING (student_id IN (
        SELECT s.id FROM public.students s
        JOIN public.classes c ON s.class_id = c.id
        WHERE c.owner_id = auth.uid()
    ) OR public.is_admin());

CREATE POLICY "class_evaluation_marks_modify" ON public.class_evaluation_marks
    FOR ALL TO authenticated
    USING (student_id IN (
        SELECT s.id FROM public.students s
        JOIN public.classes c ON s.class_id = c.id
        WHERE c.owner_id = auth.uid()
    ) AND NOT public.is_admin())
    WITH CHECK (student_id IN (
        SELECT s.id FROM public.students s
        JOIN public.classes c ON s.class_id = c.id
        WHERE c.owner_id = auth.uid()
    ) AND NOT public.is_admin());

-- ------------------------------------------------------------------------------
-- 6. DENEME_SCORES (exam_id ile bağlı olanlar)
-- ------------------------------------------------------------------------------
CREATE POLICY "deneme_scores_select" ON public.deneme_scores
    FOR SELECT TO authenticated
    USING (exam_id IN (
        SELECT e.id FROM public.deneme_exams e
        JOIN public.classes c ON e.class_id = c.id
        WHERE c.owner_id = auth.uid()
    ) OR public.is_admin());

CREATE POLICY "deneme_scores_modify" ON public.deneme_scores
    FOR ALL TO authenticated
    USING (exam_id IN (
        SELECT e.id FROM public.deneme_exams e
        JOIN public.classes c ON e.class_id = c.id
        WHERE c.owner_id = auth.uid()
    ) AND NOT public.is_admin())
    WITH CHECK (exam_id IN (
        SELECT e.id FROM public.deneme_exams e
        JOIN public.classes c ON e.class_id = c.id
        WHERE c.owner_id = auth.uid()
    ) AND NOT public.is_admin());

-- ------------------------------------------------------------------------------
-- 7. ACTIVITY_LOG (İşlem Günlüğü)
-- ------------------------------------------------------------------------------
CREATE POLICY "activity_log_select" ON public.activity_log
    FOR SELECT TO authenticated
    USING (user_id = auth.uid() OR public.is_admin());

CREATE POLICY "activity_log_insert" ON public.activity_log
    FOR INSERT TO authenticated
    WITH CHECK (user_id = auth.uid() AND NOT public.is_admin());

-- ------------------------------------------------------------------------------
-- 8. PERFORMANS VE RLS HIZLANDIRMA İNDEKSLERİ
-- ------------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_classes_owner_id ON public.classes(owner_id);
CREATE INDEX IF NOT EXISTS idx_students_class_id ON public.students(class_id);
CREATE INDEX IF NOT EXISTS idx_homeworks_class_id ON public.homeworks(class_id);
CREATE INDEX IF NOT EXISTS idx_homework_status_student_id ON public.homework_status(student_id);
CREATE INDEX IF NOT EXISTS idx_quizzes_class_id ON public.quizzes(class_id);
CREATE INDEX IF NOT EXISTS idx_quiz_scores_student_id ON public.quiz_scores(student_id);
CREATE INDEX IF NOT EXISTS idx_performance_tasks_class_id ON public.performance_tasks(class_id);
CREATE INDEX IF NOT EXISTS idx_rubrics_class_id ON public.rubrics(class_id);
CREATE INDEX IF NOT EXISTS idx_rubric_scores_student_id ON public.rubric_scores(student_id);
CREATE INDEX IF NOT EXISTS idx_deneme_exams_class_id ON public.deneme_exams(class_id);
CREATE INDEX IF NOT EXISTS idx_deneme_scores_exam_id ON public.deneme_scores(exam_id);
CREATE INDEX IF NOT EXISTS idx_deneme_scores_student_id ON public.deneme_scores(student_id);
CREATE INDEX IF NOT EXISTS idx_counseling_notes_student_id ON public.counseling_notes(student_id);
CREATE INDEX IF NOT EXISTS idx_university_goals_student_id ON public.university_goals(student_id);
CREATE INDEX IF NOT EXISTS idx_abroad_consulting_student_id ON public.abroad_consulting(student_id);
CREATE INDEX IF NOT EXISTS idx_class_evaluations_class_id ON public.class_evaluations(class_id);
CREATE INDEX IF NOT EXISTS idx_class_eval_marks_student_id ON public.class_evaluation_marks(student_id);
CREATE INDEX IF NOT EXISTS idx_activity_log_user_id ON public.activity_log(user_id);

COMMIT;
