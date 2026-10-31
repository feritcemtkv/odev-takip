---
name: vercel-deploy
description: Ödev Takip sitesini Vercel'e yayınlama adımları. Kullanıcı siteyi Vercel'e yüklemek, Vercel'de yayınlamak, önizleme/production deploy almak, Vercel ayarlarını (vercel.json, .vercelignore, alan adı) kurmak ya da Vercel deploy'unu kontrol etmek istediğinde kullan.
---

# Ödev Takip · Vercel'e yayınlama

Bu proje derleme adımı olmayan **statik bir PWA**: `index.html` + `sw.js` + `manifest.*` + `icons/` + `img/` + `lib/`. Veri Supabase'de, tarayıcıdan doğrudan çağrılıyor. Vercel'de sunucu kodu çalıştırmaya gerek yok.

## Önce bilinmesi gerekenler

- **`serve.js` Vercel'de çalışmaz.** Yalnızca yerel geliştirme sunucusu. Sağladığı `/api/school-roster` ve `/api/annual-plans` uçları Vercel'de 404 döner; `index.html` bu çağrıları `try/catch` ile sarıyor ve `localStorage`'a düşüyor, yani site bozulmaz. Bu uçları Vercel'e taşımak (ör. `api/` fonksiyonları) kullanıcıdan açık istek olmadan yapılmaz: diske yazdıkları için Vercel'de kalıcı da olmazlar.
- **Gizli/iç dosyalar yayınlanmamalı.** `sql/` (şifre sıfırlama betikleri), `scripts/`, `.github/`, `serve.js`, `package*.json`, `ANDROID_KURULUM.md`, `data/`, `backups/`, `*.xlsx` herkese açık URL'den erişilebilir olmamalı. Bu yüzden `.vercelignore` zorunlu (aşağıda).
- **CSP:** `index.html` içindeki `Content-Security-Policy` meta etiketi Supabase, `esm.sh` ve `cdnjs.cloudflare.com` dışındaki bağlantıları engeller. Vercel için değiştirmeye gerek yok; yeni bir harici kaynak eklenirse oraya da eklenmeli.
- **Service worker:** `sw.js` her deploy'da yeni sürümü alabilmeli. `sw.js` için `no-cache` başlığı verilir; içerik değiştiyse `sw.js` içindeki `CACHE_NAME` sürümü artırılır (ör. `odev-takip-v1.0.9` → `v1.0.10`), yoksa kullanıcılar eski önbelleği görür.

## 1. Proje dosyalarını hazırla (repoda yoksa oluştur)

`.vercelignore` (repo kökü):

```
sql/
scripts/
.github/
.vscode/
.claude/
data/
backups/
node_modules/
serve.js
package.json
package-lock.json
ANDROID_KURULUM.md
README.md
*.xlsx
*.xls
*.csv
*.env
.env*
```

`package.json` deploy'dan çıkarıldığı için Vercel `npm install` çalıştırmaz ve projeyi saf statik site olarak sunar.

`vercel.json` (repo kökü):

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "framework": null,
  "buildCommand": null,
  "installCommand": null,
  "outputDirectory": ".",
  "cleanUrls": false,
  "headers": [
    {
      "source": "/sw.js",
      "headers": [
        { "key": "Cache-Control", "value": "no-cache, no-store, must-revalidate" },
        { "key": "Service-Worker-Allowed", "value": "/" }
      ]
    },
    {
      "source": "/index.html",
      "headers": [{ "key": "Cache-Control", "value": "no-cache" }]
    },
    {
      "source": "/manifest.webmanifest",
      "headers": [{ "key": "Content-Type", "value": "application/manifest+json; charset=utf-8" }]
    },
    {
      "source": "/(.*)",
      "headers": [
        { "key": "X-Content-Type-Options", "value": "nosniff" },
        { "key": "X-Frame-Options", "value": "SAMEORIGIN" },
        { "key": "Referrer-Policy", "value": "strict-origin-when-cross-origin" }
      ]
    }
  ]
}
```

Bu iki dosyayı ekledikten sonra commit et. Push etmeden önce kullanıcıya sor.

## 2. Yayınlama yolu seç

Kullanıcıya hangisini istediğini sor; varsayılan **A**.

### A. GitHub bağlantısıyla (önerilen, token gerekmez)

Kullanıcı tarayıcıda yapar; sen adımları Türkçe ve kısa ver:

1. https://vercel.com/new adresinde GitHub hesabıyla giriş yap.
2. `feritcemtkv/odev-takip` reposunu **Import** et.
3. **Framework Preset: Other**. Build Command, Install Command ve Output Directory alanlarını boş bırak (`vercel.json` bunları zaten belirliyor).
4. **Deploy**. Her `main` push'u production'a, diğer dallar önizleme adresine gider.
5. Alan adı istenirse: Project → Settings → Domains.

### B. Vercel CLI ile (bu oturumdan)

Bir `VERCEL_TOKEN` gerekir (https://vercel.com/account/tokens). Token'ı asla dosyaya, commit'e ya da sohbete yazdırma; kullanıcıdan ortam değişkeni olarak (bulut oturumunda: ortam ayarlarındaki gizli değişkenler) eklemesini iste.

```bash
# önizleme
npx --yes vercel@latest deploy --yes --token "$VERCEL_TOKEN"
# production (yalnızca kullanıcı açıkça isterse)
npx --yes vercel@latest deploy --prod --yes --token "$VERCEL_TOKEN"
```

İlk çalıştırmada proje bağlanır ve `.vercel/` klasörü oluşur; `.vercel/` klasörünü `.gitignore`'a ekle, commit etme. Ağ politikası `vercel.com` / `api.vercel.com` adreslerine izin vermiyorsa CLI çalışmaz: A yoluna geç.

## 3. Yayından sonra doğrula

Deploy adresi `URL` olsun:

```bash
for p in / /index.html /sw.js /manifest.webmanifest /icons/icon-192.png /lib/xlsx.full.min.js; do
  curl -s -o /dev/null -w "%{http_code} $p\n" "$URL$p"; done      # hepsi 200 olmalı
for p in /sql/reset_erdal_password.sql /serve.js /package.json /.github/scripts/backup.mjs /scripts/restore.mjs; do
  curl -s -o /dev/null -w "%{http_code} $p\n" "$URL$p"; done      # hepsi 404 olmalı
curl -sI "$URL/sw.js" | grep -i cache-control                     # no-cache içermeli
```

Gizli dosyalardan biri 200 dönerse deploy'u hemen kullanıcıya bildir ve `.vercelignore`'u düzelttikten sonra yeniden yayınla.

Tarayıcıda giriş ekranının açıldığını, konsolda CSP hatası olmadığını ve Supabase girişinin çalıştığını kullanıcıya kontrol ettir; Supabase bu ortamdan erişilemeyebilir.

## 4. Kullanıcıya raporla

- Yayın adresi (önizleme mi production mı),
- doğrulama sonuçları (200/404 listesi),
- çalışmayan özellikler: yerel `/api/*` uçları (okul listesi kataloğu ve yıllık plan sunucu senkronu) Vercel'de yok, bu veriler tarayıcıda (`localStorage`) tutulur.
