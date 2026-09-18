-- ==============================================================================
-- ÖDEV TAKİP SİSTEMİ - KULLANICI YÖNETİMİ VE ŞİFRE İŞLEMLERİ (SUPABASE)
-- ==============================================================================
-- Bu dosya, Supabase projenizde yeni kullanıcı (öğretmen) oluşturma, şifre
-- belirleme ve şifre değiştirme işlemleri için hazırlanmıştır.
-- İhtiyacınıza göre aşağıdaki yöntemlerden birini kullanabilirsiniz:
--
-- YÖNTEM 1: SUPABASE DASHBOARD ARAYÜZÜNDEN KULLANICI EKLEME (EN KOLAY)
-- ------------------------------------------------------------------
-- 1. https://supabase.com adresinden projenize gidin.
-- 2. Sol menüden "Authentication" > "Users" sekmesini açın.
-- 3. Sağ üstteki "Add user" butonuna tıklayıp "Create user" seçeneğini seçin.
-- 4. Bilgileri girin:
--    - Email: kullaniciadi@takip.local (Örn: ahmet@takip.local veya ogretmen2@takip.local)
--    - Password: İstediğiniz şifreyi yazın (Örn: Sifre123!)
--    - "Auto Confirm User?" seçeneğini İŞARETLEYİN (Aktif olsun).
-- 5. "Create user" butonuna basın.
-- 6. Artık öğretmen uygulamada "Kullanıcı Adı" alanına sadece "ahmet" veya "ogretmen2"
--    yazarak ve belirlediğiniz şifre ile anında giriş yapabilir!
--
-- ==============================================================================
-- YÖNTEM 2: WEB ARAYÜZÜNDEN KULLANICI OLUŞTURMA FONKSİYONUNU AKTİF ETME (RPC)
-- ==============================================================================
-- Aşağıdaki fonksiyonu Supabase SQL Editor'da 1 kez çalıştırarak, uygulamanın
-- içindeki "Yeni Kullanıcı Oluştur" butonunun doğrudan çalışmasını sağlayabilirsiniz.
-- (Böylece Supabase panelinden kayıtlar kapalı olsa bile öğretmenler eklenebilir)

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE FUNCTION public.create_user_admin(new_username text, new_password text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
    clean_user text;
    user_email text;
    new_user_id uuid;
    encrypted_pw text;
BEGIN
    -- Güvenlik Kontrolü: Bu fonksiyonu yalnızca yönetici (admin) çağırabilir!
    IF NOT public.is_admin() THEN
        RETURN json_build_object('success', false, 'message', 'Yetkisiz erişim: Bu işlemi yalnızca yönetici (admin) yapabilir.');
    END IF;

    clean_user := trim(new_username);
    IF clean_user = '' THEN
        RETURN json_build_object('success', false, 'message', 'Kullanıcı adı boş olamaz.');
    END IF;

    IF length(new_password) < 6 THEN
        RETURN json_build_object('success', false, 'message', 'Şifre en az 6 karakter olmalıdır.');
    END IF;

    IF clean_user LIKE '%@%' THEN
        user_email := clean_user;
    ELSE
        user_email := clean_user || '@takip.local';
    END IF;

    IF EXISTS (SELECT 1 FROM auth.users WHERE email = user_email) THEN
        RETURN json_build_object('success', false, 'message', 'Bu kullanıcı adı zaten kayıtlı.');
    END IF;

    new_user_id := gen_random_uuid();
    encrypted_pw := crypt(new_password, gen_salt('bf'));

    INSERT INTO auth.users (
        id,
        instance_id,
        email,
        encrypted_password,
        email_confirmed_at,
        raw_app_meta_data,
        raw_user_meta_data,
        aud,
        role,
        created_at,
        updated_at
    ) VALUES (
        new_user_id,
        '00000000-0000-0000-0000-000000000000',
        user_email,
        encrypted_pw,
        now(),
        '{"provider":"email","providers":["email"]}'::jsonb,
        jsonb_build_object('username', clean_user),
        'authenticated',
        'authenticated',
        now(),
        now()
    );

    -- Kimlik eşleştirmesi (Supabase Auth email identity)
    INSERT INTO auth.identities (
        id,
        provider_id,
        user_id,
        identity_data,
        provider,
        last_sign_in_at,
        created_at,
        updated_at
    ) VALUES (
        gen_random_uuid(),
        new_user_id::text,
        new_user_id,
        jsonb_build_object('sub', new_user_id::text, 'email', user_email),
        'email',
        now(),
        now(),
        now()
    );

    RETURN json_build_object('success', true, 'message', 'Kullanıcı başarıyla oluşturuldu.', 'user_id', new_user_id);
END;
$$;

-- Fonksiyona erişim izni: anon ve genel erişim iptal edilir, sadece giriş yapmış admin çağırabilir
REVOKE EXECUTE ON FUNCTION public.create_user_admin(text, text) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.create_user_admin(text, text) TO authenticated;


-- ==============================================================================
-- YÖNTEM 3: DOĞRUDAN SQL İLE KULLANICI OLUŞTURMA
-- ==============================================================================
-- Aşağıdaki blok ile istediğiniz kullanıcıyı tek komutla hemen ekleyebilirsiniz:
/*
SELECT public.create_user_admin('yeniogretmen', 'Sifre123456');
*/


-- ==============================================================================
-- YÖNTEM 4: UNUTULAN ŞİFREYİ DOĞRUDAN SQL İLE DEĞİŞTİRME / SIFIRLAMA
-- ==============================================================================
-- Bir öğretmenin şifresini doğrudan SQL Editor'dan güncellemek için:
/*
UPDATE auth.users
SET encrypted_password = crypt('YENI_GIZLI_SIFRE', gen_salt('bf')),
    updated_at = now()
WHERE email = 'ogretmenadi@takip.local';
*/


-- ==============================================================================
-- YÖNTEM 5: YÖNETİCİ (ADMIN) HESABI VE ŞİFRESİ (SALT OKUNUR / İZLEME MODU)
-- ==============================================================================
-- Admin hesabı (admin@takip.local) sistemdeki tüm öğretmenlerin sınıflarını
-- ve içeriklerini görebilir ancak güvenlik amacıyla hiçbir veriyi değiştiremez,
-- silemez veya yeni not ekleyemez (Salt Okunur).
--
-- Bu blok, admin hesabı yoksa oluşturur; varsa şifresini 'Admin1234!' yapar:

CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
DECLARE
    v_user_id uuid;
    v_email text := 'admin@takip.local';
    v_password text := 'Admin1234!';
    v_encrypted_pw text;
BEGIN
    v_encrypted_pw := crypt(v_password, gen_salt('bf'));

    SELECT id INTO v_user_id FROM auth.users WHERE email = v_email;

    IF v_user_id IS NOT NULL THEN
        UPDATE auth.users
        SET encrypted_password = v_encrypted_pw,
            email_confirmed_at = coalesce(email_confirmed_at, now()),
            raw_app_meta_data = jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email'), 'role', 'admin'),
            raw_user_meta_data = jsonb_build_object('username', 'admin', 'role', 'admin'),
            updated_at = now()
        WHERE id = v_user_id;

        IF NOT EXISTS (SELECT 1 FROM auth.identities WHERE user_id = v_user_id) THEN
            INSERT INTO auth.identities (
                id, provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at
            ) VALUES (
                gen_random_uuid(),
                v_user_id::text,
                v_user_id,
                jsonb_build_object('sub', v_user_id::text, 'email', v_email),
                'email',
                now(),
                now(),
                now()
            );
        END IF;
    ELSE
        v_user_id := gen_random_uuid();

        INSERT INTO auth.users (
            id,
            instance_id,
            email,
            encrypted_password,
            email_confirmed_at,
            raw_app_meta_data,
            raw_user_meta_data,
            aud,
            role,
            created_at,
            updated_at
        ) VALUES (
            v_user_id,
            '00000000-0000-0000-0000-000000000000',
            v_email,
            v_encrypted_pw,
            now(),
            '{"provider":"email","providers":["email"],"role":"admin"}'::jsonb,
            '{"username":"admin","role":"admin"}'::jsonb,
            'authenticated',
            'authenticated',
            now(),
            now()
        );

        INSERT INTO auth.identities (
            id,
            provider_id,
            user_id,
            identity_data,
            provider,
            last_sign_in_at,
            created_at,
            updated_at
        ) VALUES (
            gen_random_uuid(),
            v_user_id::text,
            v_user_id,
            jsonb_build_object('sub', v_user_id::text, 'email', v_email),
            'email',
            now(),
            now(),
            now()
        );
    END IF;
END $$;


