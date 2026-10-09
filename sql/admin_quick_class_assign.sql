-- ==============================================================================
-- YÖNETİCİ (ADMIN) HIZLI SINIF EKLEME VE ÖĞRETMENE ATAMA GÜNCELLEMESİ
-- ==============================================================================
-- Bu SQL kodunu Supabase Dashboard > SQL Editor alanında 1 KEZ ÇALIŞTIRIN.
-- 
-- Bu güncelleme ile:
-- 1. Yöneticinin (Admin) sistemdeki herhangi bir öğretmene doğrudan sınıf oluşturup
--    öğrencilerini tek tıkla aktarabilmesi sağlanır.
-- 2. "create_class_for_teacher" RPC fonksiyonu eklenir (Güvenli SECURITY DEFINER).
-- 3. Gerekli RLS politikaları güncellenerek adminin öğretmenler adına sınıf ve
--    öğrenci eklemesine izin verilir.
-- ==============================================================================

-- 0. CLASSES TABLOSUNA is_counselor SÜTUNUNU EKLE (Varsa dokunmaz)
ALTER TABLE public.classes ADD COLUMN IF NOT EXISTS is_counselor BOOLEAN DEFAULT false;

-- 1. CLASSES INSERT POLİTİKASINI GÜNCELLE (Admin ve Sınıf Sahibi Ekleyebilir)
DROP POLICY IF EXISTS "classes_insert" ON public.classes;
CREATE POLICY "classes_insert" ON public.classes
    FOR INSERT TO authenticated
    WITH CHECK (owner_id = auth.uid() OR public.is_admin());

-- CLASSES UPDATE POLİTİKASI (Admin ve Sahibi Güncelleyebilir)
DROP POLICY IF EXISTS "classes_update" ON public.classes;
CREATE POLICY "classes_update" ON public.classes
    FOR UPDATE TO authenticated
    USING (owner_id = auth.uid() OR public.is_admin())
    WITH CHECK (owner_id = auth.uid() OR public.is_admin());

-- CLASSES DELETE POLİTİKASI (Admin ve Sahibi Silebilir)
DROP POLICY IF EXISTS "classes_delete" ON public.classes;
CREATE POLICY "classes_delete" ON public.classes
    FOR DELETE TO authenticated
    USING (owner_id = auth.uid() OR public.is_admin());

-- 2. STUDENTS POLİTİKALARINI GÜNCELLE (Admin Öğrenci Ekleyip Yönetebilir)
DROP POLICY IF EXISTS "students_modify" ON public.students;
CREATE POLICY "students_modify" ON public.students
    FOR ALL TO authenticated
    USING (class_id IN (SELECT id FROM public.classes WHERE owner_id = auth.uid()) OR public.is_admin())
    WITH CHECK (class_id IN (SELECT id FROM public.classes WHERE owner_id = auth.uid()) OR public.is_admin());

-- 3. HIZLI SINIF OLUŞTURMA VE ÖĞRENCİ AKTARMA RPC FONKSİYONU
CREATE OR REPLACE FUNCTION public.create_class_for_teacher(
    p_name text,
    p_owner_id uuid,
    p_is_counselor boolean DEFAULT false,
    p_students jsonb DEFAULT '[]'::jsonb
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
    new_class_id uuid;
    max_order int;
    stu record;
    stu_count int := 0;
BEGIN
    -- Güvenlik Kontrolü: Yalnızca admin veya kullanıcının kendisi çağırabilir
    IF NOT (public.is_admin() OR auth.uid() = p_owner_id) THEN
        RETURN json_build_object('success', false, 'message', 'Yetkisiz işlem: Yalnızca yönetici bu işlemi yapabilir.');
    END IF;

    p_name := trim(p_name);
    IF p_name = '' THEN
        RETURN json_build_object('success', false, 'message', 'Sınıf adı boş olamaz.');
    END IF;

    -- Öğretmenin hesabında bu isimde sınıf zaten var mı kontrol et
    IF EXISTS (SELECT 1 FROM public.classes WHERE owner_id = p_owner_id AND lower(trim(name)) = lower(p_name)) THEN
        RETURN json_build_object('success', false, 'message', 'Bu sınıf belirtilen öğretmenin hesabında zaten tanımlı.');
    END IF;

    SELECT COALESCE(MAX(sort_order), -1) INTO max_order FROM public.classes WHERE owner_id = p_owner_id;

    -- Yeni sınıfı ekle
    INSERT INTO public.classes (name, sort_order, owner_id, is_counselor)
    VALUES (p_name, max_order + 1, p_owner_id, p_is_counselor)
    RETURNING id INTO new_class_id;

    -- Eğer öğrenci listesi verildiyse tek seferde öğrencileri sınıfa aktar
    IF p_students IS NOT NULL AND jsonb_array_length(p_students) > 0 THEN
        FOR stu IN SELECT * FROM jsonb_to_recordset(p_students) AS x(name text, no text, sort_order int)
        LOOP
            INSERT INTO public.students (class_id, name, no, sort_order)
            VALUES (new_class_id, trim(stu.name), nullif(trim(stu.no), ''), coalesce(stu.sort_order, stu_count + 1));
            stu_count := stu_count + 1;
        END LOOP;
    END IF;

    RETURN json_build_object(
        'success', true,
        'class_id', new_class_id,
        'class_name', p_name,
        'owner_id', p_owner_id,
        'student_count', stu_count,
        'message', 'Sınıf başarıyla oluşturuldu ve öğretmenin hesabına tanımlandı.'
    );
END;
$$;

-- Fonksiyonu yetkilendir
REVOKE EXECUTE ON FUNCTION public.create_class_for_teacher(text, uuid, boolean, jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.create_class_for_teacher(text, uuid, boolean, jsonb) TO authenticated;

-- ==============================================================================
-- 4. OKUL YILLIK PLANLARI TABLOSU (Admin Yükler, Tüm Öğretmenler Görür)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.annual_plans (
    grade text PRIMARY KEY,
    plan_data jsonb NOT NULL DEFAULT '[]'::jsonb,
    updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.annual_plans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "annual_plans_read" ON public.annual_plans;
CREATE POLICY "annual_plans_read" ON public.annual_plans
    FOR SELECT TO authenticated
    USING (true);

DROP POLICY IF EXISTS "annual_plans_write" ON public.annual_plans;
CREATE POLICY "annual_plans_write" ON public.annual_plans
    FOR ALL TO authenticated
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

