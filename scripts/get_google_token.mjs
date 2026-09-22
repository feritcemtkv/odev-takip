import http from 'http';
import readline from 'readline';
import { exec } from 'child_process';
import { google } from 'googleapis';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

const question = (query) => new Promise((resolve) => rl.question(query, resolve));

async function main() {
  console.log('\n======================================================');
  console.log('   Google Drive OAuth Refresh Token Oluşturucu');
  console.log('======================================================\n');
  console.log('Bu araç, GitHub Actions için kalıcı Google Refresh Token almanızı sağlar.\n');

  let clientId = (process.env.GOOGLE_CLIENT_ID || '').trim();
  let clientSecret = (process.env.GOOGLE_CLIENT_SECRET || '').trim();

  if (!clientId) {
    clientId = (await question('👉 GOOGLE_CLIENT_ID girin: ')).trim();
  }
  if (!clientSecret) {
    clientSecret = (await question('👉 GOOGLE_CLIENT_SECRET girin: ')).trim();
  }

  if (!clientId || !clientSecret) {
    console.error('❌ Hata: Client ID ve Client Secret boş bırakılamaz.');
    rl.close();
    process.exit(1);
  }

  const PORT = 3000;
  const REDIRECT_URI = `http://localhost:${PORT}/oauth2callback`;

  console.log('\n⚠️  ÖNEMLİ NOT:');
  console.log('Google Cloud Console > Credentials > OAuth 2.0 Client ID ayarlarınızda;');
  console.log(`"Authorized redirect URIs" (Yetkili yönlendirme URI'leri) listesine şunun eklendiğinden emin olun:`);
  console.log(`👉 ${REDIRECT_URI}\n`);

  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, REDIRECT_URI);

  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent', // Her seferinde refresh_token vermesini garanti eder
    scope: [
      'https://www.googleapis.com/auth/drive.file',
      'https://www.googleapis.com/auth/drive',
    ],
  });

  const server = http.createServer(async (req, res) => {
    try {
      if (req.url.startsWith('/oauth2callback')) {
        const urlObj = new URL(req.url, `http://localhost:${PORT}`);
        const code = urlObj.searchParams.get('code');
        const error = urlObj.searchParams.get('error');

        if (error) {
          res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(`<h2>Giriş reddedildi: ${error}</h2><p>Terminali kontrol edin.</p>`);
          console.error(`\n❌ Google yetkilendirme hatası: ${error}`);
          cleanup();
          return;
        }

        if (code) {
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(`<h2>✅ Yetkilendirme Başarılı!</h2><p>Terminalinize dönüp yeni Refresh Token'ınızı kopyalayabilirsiniz. Bu sekmeyi kapatabilirsiniz.</p>`);

          console.log('\nYetki kodu alındı, Refresh Token oluşturuluyor...');
          const { tokens } = await oauth2Client.getToken(code);

          console.log('\n' + '='.repeat(65));
          console.log('🎉 YENİ GOOGLE REFRESH TOKEN BAŞARIYLA OLUŞTURULDU:');
          console.log('='.repeat(65));
          console.log('\n' + (tokens.refresh_token || '⚠️ DİKKAT: Refresh token dönmedi (Daha önce izin verilmiş olabilir). Lütfen prompt=consent ile tekrar deneyin.') + '\n');
          console.log('='.repeat(65));
          console.log('📌 ŞİMDİ NE YAPMALISINIZ?');
          console.log('1. Yukarıdaki token metnini kopyalayın.');
          console.log('2. GitHub reponuzda: Settings > Secrets and variables > Actions yoluna gidin.');
          console.log('3. GOOGLE_REFRESH_TOKEN secret\'ını güncelleyin ve bu yeni değeri yapıştırın.');
          console.log('4. Google Cloud Console\'da OAuth Consent Screen durumunun "In production" (Publish App)');
          console.log('   yapıldığından emin olun (Böylece token asla 7 gün sonra iptal olmaz).\n');

          cleanup();
        }
      }
    } catch (err) {
      console.error('\n❌ Token alınırken hata oluştu:', err.message);
      res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Hata: ' + err.message);
      cleanup();
    }
  });

  server.listen(PORT, () => {
    console.log('Yerel sunucu dinleniyor: ' + REDIRECT_URI);
    console.log('\n👉 Lütfen tarayıcınızda şu bağlantıyı açarak izin verin:\n');
    console.log(authUrl + '\n');

    // Windows'ta tarayıcıyı otomatik açmayı dene
    if (process.platform === 'win32') {
      exec(`start "" "${authUrl}"`);
    } else if (process.platform === 'darwin') {
      exec(`open "${authUrl}"`);
    }
  });

  function cleanup() {
    rl.close();
    server.close(() => {
      process.exit(0);
    });
  }
}

main().catch(err => {
  console.error('Beklenmeyen hata:', err);
  process.exit(1);
});
