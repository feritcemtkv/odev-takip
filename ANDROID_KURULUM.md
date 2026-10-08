# Ödev Takip - Android Uygulama & PWA Kurulum Kılavuzu

Bu proje, modern **PWA (Progressive Web App)** standartlarına tam uyumlu hale getirilmiştir. Bu sayede Android cihazlarda hiçbir APK derleme zahmetine girmeden **gerçek bir yerel mobil uygulama gibi** ana ekrana yüklenebilir ve tam ekran olarak çalışır.

---

## 📱 1. Android Telefona Uygulama Olarak Yükleme (Öğretmenler İçin)

Uygulamanız canlıya alındığında veya aynı Wi-Fi ağından telefon tarayıcınızda açıldığında:

### Yöntem A: Tek Tıkla Yükleme Butonu
1. Android cihazınızdaki tarayıcıda (Chrome, Edge veya Samsung Internet) uygulamayı açın.
2. Ekranın sağ üst köşesinde veya alt kısmında beliren **"📲 Uygulamayı Yükle"** butonuna dokunun.
3. Çıkan onay penceresinde **"Yükle"** seçeneğini onaylayın.
4. Uygulama saniyeler içinde telefonunuzun ana ekranına ve uygulama çekmecesine eklenir!

### Yöntem B: Tarayıcı Menüsünden Yükleme
1. Android Chrome tarayıcısında sayfayı açın.
2. Sağ üstteki **üç nokta (⋮)** menü simgesine dokunun.
3. Açılan menüden **"Uygulamayı Yükle"** veya **"Ana Ekrana Ekle"** seçeneğine dokunun.
4. Onay verdikten sonra uygulama telefonunuza kurulur.

---

## 🚀 2. Mobil Deneyim & Özellikler

* **Tam Ekran (Standalone):** Tarayıcı adres çubuğu ve butonları gizlenir, gerçek bir Android uygulaması gibi tam ekran çalışır.
* **Özel Android Simgesi:** Telefonunuzun ana ekranında ve kilit ekranında yüksek çözünürlüklü mavi & kurumsal Ödev Takip simgesi görünür.
* **Çentik ve Çerçeve Uyumu (Safe Area):** Yeni nesil Android telefonların üst kamera deliği ve alt gezinme çubuğuna özel otomatik boşluk bırakır.
* **Otomatik Senkronizasyon & Hızlı Açılış:** `sw.js` (Service Worker) altyapısı sayesinde uygulama kabuğu anında açılır, Supabase bulut veritabanı ile canlı iletişim sürer.
* **Otomatik Güncelleme:** Uygulamada bir kod değişikliği yapıldığında kullanıcıların yeniden APK indirmesine gerek kalmaz; uygulama arka planda kendini otomatik günceller.

---

## 🌐 3. İnternette Yayına Alma (Canlıya Çıkma)

PWA özelliklerinin Android telefonlarda aktif olması için sitenin **HTTPS** bağlantısıyla yayınlanması gerekir. Bunun için en pratik yöntemler:

1. **Vercel / Netlify / GitHub Pages (Önerilen - Ücretsiz & 1 Dakika):**
   - Bu klasördeki dosyaları doğrudan GitHub reposuna gönderip Vercel veya Netlify'a bağlayabilirsiniz.
   - Otomatik ücretsiz HTTPS ve özel bağlantı adresi (örn. `https://odev-takip.vercel.app`) sağlar.

2. **Mevcut Sunucunuz:**
   - Dosyaları SSL sertifikası (HTTPS) olan herhangi bir web hosting veya sunucuya yükleyebilirsiniz.

---

## 📦 4. (Opsiyonel) Doğrudan .APK Dosyası Üretmek İsterseniz

Eğer Google Play Store'a yüklemek veya doğrudan `.apk` dosyası dağıtmak isterseniz:
1. Sitenizi canlıya aldıktan sonra [PWABuilder](https://www.pwabuilder.com) adresine gidin.
2. Sitenizin URL'sini girin.
3. **"Package for Android"** butonuna tıklayın.
4. Sistem manifestoyu ve simgeleri otomatik okuyarak size doğrudan imzalanabilir bir **Android APK / AAB** paketi verecektir.

---

## 💻 Yerel Test (Bilgisayardan Çalıştırma)

Geliştirme sunucusunu çalıştırmak için:
```bash
npm start
```
Sunucu başladığında tarayıcınızdan `http://localhost:8085` adresine gidebilirsiniz.
