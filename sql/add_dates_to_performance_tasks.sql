-- ==============================================================================
-- PERFORMANS ÖDEVLERİNE VERİLME VE KONTROL TARİHİ EKLEME
-- ==============================================================================
-- Bu SQL kodunu Supabase Dashboard > SQL Editor alanında 1 KEZ ÇALIŞTIRIN.
-- ==============================================================================

-- 1. Tarih sütunlarını performance_tasks tablosuna ekle
ALTER TABLE public.performance_tasks ADD COLUMN IF NOT EXISTS given_date date;
ALTER TABLE public.performance_tasks ADD COLUMN IF NOT EXISTS due_date date;

-- 2. Senkronizasyon fonksiyonunu tarih parametreleriyle güncelle
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

GRANT EXECUTE ON FUNCTION public.sync_grade_performance_tasks(text, text, jsonb, text, text) TO authenticated;
