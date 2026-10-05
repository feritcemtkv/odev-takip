-- ==============================================================================
-- YÖNETİCİ (ADMIN) ERİŞİMİ VE PERFORMANS ÖDEVİ TARİH DÜZELTME YAMASI
-- ==============================================================================
-- Bu SQL dosyasını Supabase Dashboard > SQL Editor sekmesinde 1 KEZ ÇALIŞTIRIN.
-- 
-- Bu komutlar:
-- 1. Admin kullanıcısına ('admin@takip.local') 'admin' rolü ve tam erişim atar.
-- 2. public.is_admin() fonksiyonunu auth.users tablosu ile %100 uyumlu ve
--    büyük/küçük harf duyarsız hale getirerek yöneticinin TÜM verileri görmesini sağlar.
-- 3. performance_tasks tablosuna eksik olan 'given_date' ve 'due_date' sütunlarını ekler.
-- 4. Performans ödevi ve rubrik kopyalama fonksiyonlarını tarihleri de aktaracak şekilde günceller.
-- ==============================================================================

BEGIN;

-- ------------------------------------------------------------------------------
-- 1. PERFORMANS ÖDEVLERİ TABLOSUNA TARİH SÜTUNLARINI EKLE
-- ------------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.performance_tasks ADD COLUMN IF NOT EXISTS given_date date;
ALTER TABLE IF EXISTS public.performance_tasks ADD COLUMN IF NOT EXISTS due_date date;

-- ------------------------------------------------------------------------------
-- 2. ADMIN KULLANICISININ ROLÜNÜ GÜNCELLE VE ONAYLA
-- ------------------------------------------------------------------------------
UPDATE auth.users
SET raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email'), 'role', 'admin'),
    raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb) || jsonb_build_object('role', 'admin', 'username', 'admin'),
    email_confirmed_at = coalesce(email_confirmed_at, now()),
    updated_at = now()
WHERE lower(email) = 'admin@takip.local';

-- ------------------------------------------------------------------------------
-- 3. KURŞUN GEÇİRMEZ is_admin() TESPİT FONKSİYONU
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
  SELECT 
    -- 1. JWT içindeki email kontrolü (büyük/küçük harf duyarsız)
    (lower(coalesce(auth.jwt() ->> 'email', '')) = 'admin@takip.local')
    -- 2. JWT içindeki app_metadata rolü
    OR (coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'admin')
    -- 3. JWT içindeki user_metadata rolü
    OR (coalesce(auth.jwt() -> 'user_metadata' ->> 'role', '') = 'admin')
    -- 4. auth.users tablosunda doğrudan kullanıcı kaydı kontrolü
    OR EXISTS (
      SELECT 1 FROM auth.users
      WHERE id = auth.uid()
        AND (
          lower(email) = 'admin@takip.local'
          OR coalesce(raw_app_meta_data->>'role', '') = 'admin'
          OR coalesce(raw_user_meta_data->>'role', '') = 'admin'
        )
    );
$$;

GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin() TO anon;

-- ------------------------------------------------------------------------------
-- 4. PERFORMANS ÖDEVİ SENKRONİZASYON FONKSİYONLARINI GÜNCELLE
-- ------------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.sync_grade_performance_tasks(text, text, jsonb);

CREATE OR REPLACE FUNCTION public.sync_grade_performance_tasks(
    p_grade text,
    p_label text,
    p_criteria jsonb DEFAULT NULL,
    p_given_date text DEFAULT NULL,
    p_due_date text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
    cls record;
    max_slot int;
    synced_classes int := 0;
BEGIN
    IF trim(coalesce(p_grade, '')) = '' OR trim(coalesce(p_label, '')) = '' THEN
        RETURN json_build_object('success', false, 'message', 'Geçersiz parametreler.');
    END IF;

    FOR cls IN
        SELECT id, name FROM public.classes
        WHERE name ~* ('(^|[^0-9])' || trim(p_grade) || '([^0-9]|$)')
    LOOP
        IF NOT EXISTS (SELECT 1 FROM public.performance_tasks WHERE class_id = cls.id AND label = trim(p_label)) THEN
            SELECT COALESCE(MAX(slot_no), 0) INTO max_slot FROM public.performance_tasks WHERE class_id = cls.id;
            INSERT INTO public.performance_tasks (class_id, slot_no, label, given_date, due_date)
            VALUES (
                cls.id,
                max_slot + 1,
                trim(p_label),
                CASE WHEN trim(coalesce(p_given_date, '')) = '' THEN NULL ELSE p_given_date::date END,
                CASE WHEN trim(coalesce(p_due_date, '')) = '' THEN NULL ELSE p_due_date::date END
            );
        ELSE
            UPDATE public.performance_tasks
            SET given_date = CASE WHEN p_given_date IS NOT NULL AND trim(p_given_date) <> '' THEN p_given_date::date ELSE given_date END,
                due_date = CASE WHEN p_due_date IS NOT NULL AND trim(p_due_date) <> '' THEN p_due_date::date ELSE due_date END
            WHERE class_id = cls.id AND label = trim(p_label);
        END IF;

        IF p_criteria IS NOT NULL THEN
            INSERT INTO public.rubrics (class_id, level, criteria)
            VALUES (cls.id, trim(p_label), p_criteria)
            ON CONFLICT (class_id, level)
            DO UPDATE SET criteria = EXCLUDED.criteria;
        END IF;

        synced_classes := synced_classes + 1;
    END LOOP;

    RETURN json_build_object('success', true, 'synced_classes', synced_classes);
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_all_grade_performance_from_class(
    p_source_class_id uuid
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
    src_class record;
    src_grade text;
    target_class record;
    task record;
    rubric_rec record;
    max_slot int;
    total_synced int := 0;
BEGIN
    SELECT id, name INTO src_class FROM public.classes WHERE id = p_source_class_id;
    IF NOT FOUND THEN
        RETURN json_build_object('success', false, 'message', 'Kaynak sınıf bulunamadı.');
    END IF;

    src_grade := (regexp_match(src_class.name, '(^|[^0-9])(9|10|11|12)([^0-9]|$)'))[2];
    IF src_grade IS NULL THEN
        RETURN json_build_object('success', false, 'message', 'Sınıf seviyesi (9, 10, 11) tespit edilemedi.');
    END IF;

    FOR target_class IN
        SELECT id, name FROM public.classes
        WHERE id <> p_source_class_id
          AND name ~* ('(^|[^0-9])' || src_grade || '([^0-9]|$)')
    LOOP
        FOR task IN
            SELECT label, given_date, due_date FROM public.performance_tasks WHERE class_id = p_source_class_id ORDER BY slot_no
        LOOP
            IF NOT EXISTS (SELECT 1 FROM public.performance_tasks WHERE class_id = target_class.id AND label = task.label) THEN
                SELECT COALESCE(MAX(slot_no), 0) INTO max_slot FROM public.performance_tasks WHERE class_id = target_class.id;
                INSERT INTO public.performance_tasks (class_id, slot_no, label, given_date, due_date)
                VALUES (target_class.id, max_slot + 1, task.label, task.given_date, task.due_date);
            ELSE
                UPDATE public.performance_tasks
                SET given_date = COALESCE(task.given_date, given_date),
                    due_date = COALESCE(task.due_date, due_date)
                WHERE class_id = target_class.id AND label = task.label;
            END IF;

            SELECT criteria INTO rubric_rec FROM public.rubrics WHERE class_id = p_source_class_id AND level = task.label;
            IF FOUND AND rubric_rec.criteria IS NOT NULL THEN
                INSERT INTO public.rubrics (class_id, level, criteria)
                VALUES (target_class.id, task.label, rubric_rec.criteria)
                ON CONFLICT (class_id, level)
                DO UPDATE SET criteria = EXCLUDED.criteria;
            END IF;
        END LOOP;

        total_synced := total_synced + 1;
    END LOOP;

    RETURN json_build_object('success', true, 'grade', src_grade, 'target_classes_count', total_synced);
END;
$$;

GRANT EXECUTE ON FUNCTION public.sync_grade_performance_tasks(text, text, jsonb, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sync_all_grade_performance_from_class(uuid) TO authenticated;

COMMIT;
