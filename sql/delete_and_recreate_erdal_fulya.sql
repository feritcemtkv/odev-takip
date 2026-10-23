-- ==============================================================================
-- ERDAL VE FULYA KULLANICILARINI SİLME VE YENİDEN TANIMLAMA (SUPABASE)
-- ==============================================================================
-- Bu SQL kodunu Supabase Dashboard > SQL Editor alanında çalıştırın:
-- https://supabase.com/dashboard/project/miekldpkuclbinclnvvu/sql/new

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ------------------------------------------------------------------------------
-- ADIM 1: ERDAL VE FULYA'YI AUTH SİSTEMİNDEN TAMAMEN SİL
-- ------------------------------------------------------------------------------
-- Kimlik (identities) kayıtlarını sil:
DELETE FROM auth.identities
WHERE user_id IN (
    SELECT id FROM auth.users WHERE lower(email) IN ('erdal@takip.local', 'fulya@takip.local')
);

-- Kullanıcı (users) kayıtlarını sil:
DELETE FROM auth.users
WHERE lower(email) IN ('erdal@takip.local', 'fulya@takip.local');


-- ------------------------------------------------------------------------------
-- ADIM 2: YENİDEN TANIMLANDIKLARINDA ESKİ SINIFLARI OTOMATİK BAĞLAYAN TETİKLEYİCİ
-- ------------------------------------------------------------------------------
-- Erdal ve Fulya'yı web arayüzünden veya Supabase panelinden yeniden eklediğinizde,
-- Erdal'ın kayıtlı 4 sınıfı (12F, 12D, 10E, 9C - 86 öğrenci) ve Fulya'nın sınıfı
-- hiçbir veri kaybı olmadan otomatik olarak yeni hesaplarına devredilir:
CREATE OR REPLACE FUNCTION public.relink_classes_on_user_create()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    u_name text;
    old_erdal_id uuid := 'ef944170-a470-4f1d-a2fe-55d0cbcee698';
    old_fulya_id uuid := '25e61bc6-8532-4210-ab1d-95e72f1862fe';
BEGIN
    u_name := lower(split_part(new.email, '@', 1));

    IF u_name = 'erdal' THEN
        UPDATE public.classes SET owner_id = new.id WHERE owner_id = old_erdal_id;
    ELSIF u_name = 'fulya' THEN
        UPDATE public.classes SET owner_id = new.id WHERE owner_id = old_fulya_id;
    END IF;

    RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS trg_relink_classes_on_user_create ON auth.users;
CREATE TRIGGER trg_relink_classes_on_user_create
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.relink_classes_on_user_create();


-- ------------------------------------------------------------------------------
-- ADIM 3 (İSTEĞE BAĞLI): 123456 ŞİFRESİYLE HEMEN VE OTOMATİK OLUŞTURMAK İÇİN
-- ------------------------------------------------------------------------------
-- Eğer kullanıcıları web arayüzünden tek tek eklemekle uğraşmak istemiyorsanız,
-- aşağıdaki blok Erdal ve Fulya'yı '123456' şifresiyle HEMEN oluşturur:
DO $$
DECLARE
    v_erdal_id uuid := gen_random_uuid();
    v_fulya_id uuid := gen_random_uuid();
    v_pw text := crypt('123456', gen_salt('bf'));
BEGIN
    -- Erdal hesabını oluştur (Şifre: 123456)
    INSERT INTO auth.users (
        id, instance_id, email, encrypted_password, email_confirmed_at,
        raw_app_meta_data, raw_user_meta_data, aud, role, created_at, updated_at
    ) VALUES (
        v_erdal_id, '00000000-0000-0000-0000-000000000000', 'erdal@takip.local',
        v_pw, now(), '{"provider":"email","providers":["email"]}'::jsonb,
        '{"username":"erdal"}'::jsonb, 'authenticated', 'authenticated', now(), now()
    );

    INSERT INTO auth.identities (
        id, provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at
    ) VALUES (
        gen_random_uuid(), v_erdal_id::text, v_erdal_id,
        jsonb_build_object('sub', v_erdal_id::text, 'email', 'erdal@takip.local'),
        'email', now(), now(), now()
    );

    -- Erdal'ın sınıflarını yeni hesabına devret:
    UPDATE public.classes SET owner_id = v_erdal_id WHERE owner_id = 'ef944170-a470-4f1d-a2fe-55d0cbcee698';

    -- Fulya hesabını oluştur (Şifre: 123456)
    INSERT INTO auth.users (
        id, instance_id, email, encrypted_password, email_confirmed_at,
        raw_app_meta_data, raw_user_meta_data, aud, role, created_at, updated_at
    ) VALUES (
        v_fulya_id, '00000000-0000-0000-0000-000000000000', 'fulya@takip.local',
        v_pw, now(), '{"provider":"email","providers":["email"]}'::jsonb,
        '{"username":"fulya"}'::jsonb, 'authenticated', 'authenticated', now(), now()
    );

    INSERT INTO auth.identities (
        id, provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at
    ) VALUES (
        gen_random_uuid(), v_fulya_id::text, v_fulya_id,
        jsonb_build_object('sub', v_fulya_id::text, 'email', 'fulya@takip.local'),
        'email', now(), now(), now()
    );

    -- Fulya'nın sınıflarını yeni hesabına devret:
    UPDATE public.classes SET owner_id = v_fulya_id WHERE owner_id = '25e61bc6-8532-4210-ab1d-95e72f1862fe';
END $$;
