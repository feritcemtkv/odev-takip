# Ödev Takip Sistemi

Öğretmenler için sınıf, öğrenci, ödev, deneme sınavı (TYT/AYT), KDS, performans rubriği ve rehberlik takibi sağlayan web uygulaması ve otomatik Google Drive yedekleme sistemi.

## Güvenlik ve Kurulum

### 1. Veritabanı Güvenliği (Supabase RLS)

Sistemin çok kiracılı (multi-tenant) güvenliğini ve her öğretmenin yalnızca kendi sınıf verilerine erişebilmesini sağlamak için:
1. Supabase Dashboard'a gidin.
2. Sol menüden **SQL Editor** bölümünü açın.
3. [`sql/security_and_rls.sql`](sql/security_and_rls.sql) dosyasındaki komutları yapıştırıp **Run** butonuna basarak çalıştırın.

Bu işlem tüm tablolarda Row Level Security (RLS) politikalarını ve indeksleri devreye alır.

### 2. Otomatik Google Drive Yedekleme Kurulumu

GitHub Actions iş akışının (`.github/workflows/backup.yml`) çalışabilmesi için GitHub reponuzda **Settings > Secrets and variables > Actions** alanından aşağıdaki gizli anahtarları ekleyin:

| Secret Adı | Açıklama |
|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase Dashboard > Project Settings > API > `service_role` (gizli) anahtarı |
| `TEACHER_USERNAME` | Yedeklenecek öğretmenin kullanıcı adı (veya e-posta adresi) |
| `GOOGLE_CLIENT_ID` | Google Cloud Console OAuth 2.0 Client ID |
| `GOOGLE_CLIENT_SECRET` | Google Cloud Console OAuth 2.0 Client Secret |
| `GOOGLE_REFRESH_TOKEN` | Google Drive API için oluşturulan Refresh Token |
| `GOOGLE_DRIVE_FOLDER_ID` | Yedek .json dosyalarının kaydedileceği Google Drive klasörünün ID'si |

### 3. Yedekleme Zamanlaması

- Yedekleme iş akışı her gün **20:00 UTC (23:00 TSİ)** otomatik olarak çalışır.
- İstenirse GitHub Actions sekmesinden **"Otomatik Excel Yedek" > "Run workflow"** butonu ile manuel olarak da tetiklenebilir.
