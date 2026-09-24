-- ==============================================================================
-- TÜM KULLANICILAR İÇİN PERFORMANS ÖDEVİ VE RUBRİK EŞİTLEME SİSTEMİ
-- ==============================================================================
-- Bu SQL kodunu Supabase Dashboard > SQL Editor alanında 1 KEZ ÇALIŞTIRIN.
-- Bu sayede herhangi bir öğretmen 9, 10 veya 11. sınıfa performans ödevi veya
-- rubrik girdiğinde, sistemdeki DİĞER TÜM ÖĞRETMENLERİN aynı seviyedeki
-- sınıflarına da otomatik olarak bu ödev ve rubrik aktarılır.
-- ==============================================================================

-- 1. Güvenlik Politikalarını Güncelle (Ölçüt şablonlarını tüm öğretmenlerin okuyabilmesi için)
-- Not: Öğrenci notları (rubric_scores) kesinlikle gizli kalır; sadece boş rubrik ölçütleri paylaşılır.
DROP POLICY IF EXISTS "performance_tasks_select_all" ON public.performance_tasks;
CREATE POLICY "performance_tasks_select_all" ON public.performance_tasks
    FOR SELECT TO authenticated
    USING (true);

DROP POLICY IF EXISTS "rubrics_select_all" ON public.rubrics;
CREATE POLICY "rubrics_select_all" ON public.rubrics
    FOR SELECT TO authenticated
    USING (true);

DROP POLICY IF EXISTS "classes_select_names" ON public.classes;
CREATE POLICY "classes_select_names" ON public.classes
    FOR SELECT TO authenticated
    USING (true);

-- Tabloya verilme tarihi ve kontrol tarihi sütunlarını ekle
ALTER TABLE public.performance_tasks ADD COLUMN IF NOT EXISTS given_date date;
ALTER TABLE public.performance_tasks ADD COLUMN IF NOT EXISTS due_date date;

-- 2. Tüm Kullanıcıların Sınıflarına Performans Ödevi ve Rubrik Eşitleyen Fonksiyon
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

    -- Sistemdeki TÜM kullanıcıların aynı seviyedeki sınıflarını bul
    FOR cls IN
        SELECT id, name FROM public.classes
        WHERE name ~* ('(^|[^0-9])' || trim(p_grade) || '([^0-9]|$)')
    LOOP
        -- 1. Performans ödevi henüz sınıfta yoksa ekle, varsa tarihleri güncelle
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

        -- 2. Eğer rubrik kriterleri verildiyse rubrics tablosuna kaydet / güncelle
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

-- 3. Performans Ödevi İsim Değişikliğini Tüm Kullanıcılara Yansıtan Fonksiyon
CREATE OR REPLACE FUNCTION public.rename_grade_performance_task(
    p_grade text,
    p_old_label text,
    p_new_label text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
    cls record;
    affected int := 0;
BEGIN
    FOR cls IN
        SELECT id FROM public.classes
        WHERE name ~* ('(^|[^0-9])' || trim(p_grade) || '([^0-9]|$)')
    LOOP
        UPDATE public.performance_tasks SET label = trim(p_new_label) WHERE class_id = cls.id AND label = trim(p_old_label);
        UPDATE public.rubrics SET level = trim(p_new_label) WHERE class_id = cls.id AND level = trim(p_old_label);
        affected := affected + 1;
    END LOOP;

    RETURN json_build_object('success', true, 'affected_classes', affected);
END;
$$;

-- 4. Performans Ödevi Silmeyi Tüm Kullanıcılara Yansıtan Fonksiyon
CREATE OR REPLACE FUNCTION public.delete_grade_performance_task(
    p_grade text,
    p_label text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
    cls record;
    deleted int := 0;
BEGIN
    FOR cls IN
        SELECT id FROM public.classes
        WHERE name ~* ('(^|[^0-9])' || trim(p_grade) || '([^0-9]|$)')
    LOOP
        DELETE FROM public.performance_tasks WHERE class_id = cls.id AND label = trim(p_label);
        DELETE FROM public.rubrics WHERE class_id = cls.id AND level = trim(p_label);
        deleted := deleted + 1;
    END LOOP;

    RETURN json_build_object('success', true, 'deleted_classes', deleted);
END;
$$;

-- 5. Belirli Bir Sınıftaki Tüm Performans Ödev ve Rubriklerini Tüm Kullanıcıların Aynı Seviyedeki Sınıflarına Kopyalama
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

    -- Sınıf seviyesini belirle (9, 10, 11, 12)
    src_grade := (regexp_match(src_class.name, '(^|[^0-9])(9|10|11|12)([^0-9]|$)'))[2];
    IF src_grade IS NULL THEN
        RETURN json_build_object('success', false, 'message', 'Sınıf seviyesi (9, 10, 11) tespit edilemedi.');
    END IF;

    -- Tüm hedef sınıfları döngüye al
    FOR target_class IN
        SELECT id, name FROM public.classes
        WHERE id <> p_source_class_id
          AND name ~* ('(^|[^0-9])' || src_grade || '([^0-9]|$)')
    LOOP
        -- Kaynak sınıftaki tüm performans ödevlerini kopyala
        FOR task IN
            SELECT label FROM public.performance_tasks WHERE class_id = p_source_class_id ORDER BY slot_no
        LOOP
            IF NOT EXISTS (SELECT 1 FROM public.performance_tasks WHERE class_id = target_class.id AND label = task.label) THEN
                SELECT COALESCE(MAX(slot_no), 0) INTO max_slot FROM public.performance_tasks WHERE class_id = target_class.id;
                INSERT INTO public.performance_tasks (class_id, slot_no, label)
                VALUES (target_class.id, max_slot + 1, task.label);
            END IF;

            -- Rubriği kopyala
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

-- Fonksiyonları tüm giriş yapmış öğretmenlerin çağırabilmesi için yetkilendir
GRANT EXECUTE ON FUNCTION public.sync_grade_performance_tasks(text, text, jsonb, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rename_grade_performance_task(text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_grade_performance_task(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sync_all_grade_performance_from_class(uuid) TO authenticated;
