import { createClient } from '@supabase/supabase-js';
import { google } from 'googleapis';
import { Readable } from 'stream';
import fs from 'fs';
import path from 'path';
import XLSX from 'xlsx';

const SUPABASE_URL = 'https://miekldpkuclbinclnvvu.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
const TEACHER_USERNAME = (process.env.TEACHER_USERNAME || '').trim();
const GOOGLE_CLIENT_ID = (process.env.GOOGLE_CLIENT_ID || '').trim();
const GOOGLE_CLIENT_SECRET = (process.env.GOOGLE_CLIENT_SECRET || '').trim();
const GOOGLE_REFRESH_TOKEN = (process.env.GOOGLE_REFRESH_TOKEN || '').trim();
const GOOGLE_DRIVE_FOLDER_ID = (process.env.GOOGLE_DRIVE_FOLDER_ID || '').trim();
const GOOGLE_SERVICE_ACCOUNT_KEY = (process.env.GOOGLE_SERVICE_ACCOUNT_KEY || '').trim();

if (!SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌ Eksik Secret: SUPABASE_SERVICE_ROLE_KEY tanımlı değil.');
  process.exit(1);
}

const PREDEFINED_TEACHERS = [
  { id: '8cec1a66-5554-437a-8c5a-dd74a402da34', username: 'feritcem', name: 'Ferit Cem (feritcem)', email: 'feritcem@takip.local' },
  { id: '6d54dccb-66b4-41b0-b810-4c581591d2d6', username: 'candan', name: 'Candan Sarıkan (candan)', email: 'candan@takip.local' },
  { id: 'bce1ad28-a1c6-48d9-b58f-1f2161c3334f', username: 'hasancem', name: 'Cem Gürakar (hasancem)', email: 'hasancem@takip.local' },
  { id: '25e61bc6-8532-4210-ab1d-95e72f1862fe', username: 'fulya', name: 'Fulya Hoca (fulya)', email: 'fulya@takip.local' },
  { id: '44e4e770-ecf5-4e9e-bf59-d89ebdd21237', username: 'murat', name: 'Murat Hoca (murat)', email: 'murat@takip.local' },
  { id: 'ef944170-a470-4f1d-a2fe-55d0cbcee698', username: 'erdal', name: 'Erdal Hoca (erdal)', email: 'erdal@takip.local' },
  { id: '8ec77d6a-dbea-41e1-801f-14659969906f', username: 'yunus', name: 'Yunus Hoca (yunus)', email: 'yunus@takip.local' },
  { id: '17d43b79-1d72-4389-afb7-49b15d50678f', username: 'ozge', name: 'Özge Hoca (ozge)', email: 'ozge@takip.local' }
];

const hasServiceAccount = Boolean(GOOGLE_SERVICE_ACCOUNT_KEY);
const hasOAuth = Boolean(GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET && GOOGLE_REFRESH_TOKEN);
const hasGoogleDrive = Boolean(GOOGLE_DRIVE_FOLDER_ID && (hasServiceAccount || hasOAuth));

const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

function timestampStrTR() {
  const d = new Date(Date.now() + 3 * 60 * 60 * 1000);
  const pad = n => String(n).padStart(2, '0');
  return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate())
    + '_' + pad(d.getUTCHours()) + '-' + pad(d.getUTCMinutes());
}

function getDriveClient() {
  if (!hasGoogleDrive) return null;
  try {
    if (hasServiceAccount) {
      let credentials;
      const raw = GOOGLE_SERVICE_ACCOUNT_KEY.startsWith('{')
        ? GOOGLE_SERVICE_ACCOUNT_KEY
        : Buffer.from(GOOGLE_SERVICE_ACCOUNT_KEY, 'base64').toString('utf-8');
      credentials = JSON.parse(raw);
      const auth = new google.auth.GoogleAuth({
        credentials,
        scopes: ['https://www.googleapis.com/auth/drive'],
      });
      return google.drive({ version: 'v3', auth });
    }
    if (hasOAuth) {
      const oauth2Client = new google.auth.OAuth2(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET);
      oauth2Client.setCredentials({ refresh_token: GOOGLE_REFRESH_TOKEN });
      return google.drive({ version: 'v3', auth: oauth2Client });
    }
  } catch (e) {
    console.warn('⚠️ Google Drive istemcisi başlatılamadı:', e.message);
  }
  return null;
}

// Supabase tek sorguda en fazla 1000 satır döndürür; sayfa sayfa okuyup
// toplam satır sayısıyla karşılaştırarak eksik yedek alınmasını engeller.
const PAGE_SIZE = 1000;
async function fetchAllPages(table, column, values) {
  const results = [];
  let expected = null;
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error, count } = await sb.from(table)
      .select('*', { count: 'exact' })
      .in(column, values)
      .order(column)
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(`${table} (${column}) okunamadı: ${error.message}`);
    if (expected === null) expected = count;
    results.push(...(data || []));
    if (!data || data.length < PAGE_SIZE) break;
  }
  if (expected !== null && results.length !== expected) {
    throw new Error(`${table} eksik okundu: ${results.length}/${expected} satır`);
  }
  return results;
}

async function fetchByIds(table, column, ids) {
  if (!ids.length) return [];
  const results = [];
  const CHUNK = 50;
  for (let i = 0; i < ids.length; i += CHUNK) {
    results.push(...await fetchAllPages(table, column, ids.slice(i, i + CHUNK)));
  }
  return results;
}

async function fetchOwnerScopedTables(ownerId) {
  const dump = {};

  const { data: classes, error: classErr } = await sb.from('classes').select('*').eq('owner_id', ownerId);
  if (classErr) throw new Error('classes okunamadı: ' + classErr.message);
  dump.classes = classes || [];
  const classIds = dump.classes.map(c => c.id).filter(Boolean);

  const byClassIds = (table) => fetchByIds(table, 'class_id', classIds);
  const byStudentIds = (table, studentIds) => fetchByIds(table, 'student_id', studentIds);

  dump.students = await byClassIds('students');
  const studentIds = dump.students.map(s => s.id).filter(Boolean);

  dump.homeworks = await byClassIds('homeworks');
  dump.homework_status = await byStudentIds('homework_status', studentIds);

  dump.quizzes = await byClassIds('quizzes');
  dump.quiz_scores = await byStudentIds('quiz_scores', studentIds);

  dump.performance_tasks = await byClassIds('performance_tasks');
  dump.rubrics = await byClassIds('rubrics');
  dump.rubric_scores = await byStudentIds('rubric_scores', studentIds);

  dump.deneme_exams = await byClassIds('deneme_exams');
  const examIds = dump.deneme_exams.map(e => e.id).filter(Boolean);
  dump.deneme_scores = await fetchByIds('deneme_scores', 'exam_id', examIds);

  dump.counseling_notes = await byStudentIds('counseling_notes', studentIds);
  dump.university_goals = await byStudentIds('university_goals', studentIds);
  dump.abroad_consulting = await byStudentIds('abroad_consulting', studentIds);
  dump.class_evaluations = await byClassIds('class_evaluations');
  dump.class_evaluation_marks = await byStudentIds('class_evaluation_marks', studentIds);

  return dump;
}

function buildExcelBackup(dump) {
  const wb = XLSX.utils.book_new();

  const addSheet = (data, sheetName) => {
    if (!data || !data.length) return;
    const ws = XLSX.utils.json_to_sheet(data);
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
  };

  const classMap = {};
  (dump.classes || []).forEach(c => { classMap[c.id] = c.name; });

  const studentMap = {};
  (dump.students || []).forEach(s => { studentMap[s.id] = (s.no ? s.no + ' - ' : '') + s.name; });

  // 1. Sınıflar
  addSheet((dump.classes || []).map(c => ({
    'Sınıf Adı': c.name,
    'Sıra': c.sort_order,
    'Danışmanlık': c.is_counselor ? 'Evet' : 'Hayır'
  })), 'Sınıflar');

  // 2. Öğrenciler
  addSheet((dump.students || []).map(s => ({
    'Sınıf': classMap[s.class_id] || '',
    'No': s.no || '',
    'Ad Soyad': s.name,
    'Okulda Yok': s.absent ? 'Evet' : 'Hayır',
    'Dershane': s.dershane || '',
    'Özel Ders': s.ozel_ders || '',
    'Öğretmen Notu': s.teacher_note || ''
  })), 'Öğrenciler');

  // 3. Ödevler
  addSheet((dump.homeworks || []).map(h => ({
    'Sınıf': classMap[h.class_id] || '',
    'Slot': h.slot_no,
    'Konu': h.topic || '',
    'Veriliş Tarihi': h.hw_date || '',
    'Kontrol Tarihi': h.check_date || ''
  })), 'Ödevler');

  // 4. Ödev Durumları
  addSheet((dump.homework_status || []).map(hs => ({
    'Öğrenci': studentMap[hs.student_id] || hs.student_id,
    'Ödev Slot': hs.slot_no,
    'Yapıldı': hs.done ? 'Evet' : 'Hayır'
  })), 'Ödev Durumları');

  // 5. Deneme Sınavları
  addSheet((dump.deneme_exams || []).map(e => ({
    'Sınıf': classMap[e.class_id] || '',
    'Sınav Türü': e.exam_type ? e.exam_type.toUpperCase() : '',
    'Sınav Adı': e.label,
    'Tarih': e.exam_date || '',
    'Dersler': (e.subjects || []).join(', ')
  })), 'Denemeler');

  // 6. Deneme Notları
  addSheet((dump.deneme_scores || []).map(ds => ({
    'Öğrenci': studentMap[ds.student_id] || ds.student_id,
    'Ders': ds.subject,
    'Doğru': ds.dogru ?? '',
    'Yanlış': ds.yanlis ?? '',
    'Boş': ds.bos ?? ''
  })), 'Deneme Notları');

  // 7. Danışmanlık ve Görüşmeler
  if (dump.counseling_notes && dump.counseling_notes.length) {
    addSheet(dump.counseling_notes.map(n => ({
      'Öğrenci': studentMap[n.student_id] || n.student_id,
      'Tarih': n.note_date || '',
      'Tür': n.meeting_type === 'veli' ? 'Veli Görüşmesi' : 'Öğrenci Görüşmesi',
      'Görüşmeyi Yapan': n.interviewer || '',
      'Neden': n.reason || '',
      'İçerik': n.content || '',
      'Değerlendirme': n.evaluation || ''
    })), 'Görüşmeler');
  }

  // 8. Üniversite Hedefleri
  if (dump.university_goals && dump.university_goals.length) {
    const ugRows = [];
    dump.university_goals.forEach(g => {
      (g.goals || []).forEach((goal, i) => {
        ugRows.push({
          'Öğrenci': studentMap[g.student_id] || g.student_id,
          'Dönem': g.period,
          'Tercih Sırası': i + 1,
          'Meslek/Bölüm': goal.profession || '',
          'Üniversite': goal.university || '',
          'Almanya İsteği': g.germany_interest === true ? 'Evet' : (g.germany_interest === false ? 'Hayır' : '')
        });
      });
    });
    addSheet(ugRows, 'Üniversite Hedefleri');
  }

  // 9. Sınıf Durum Değerlendirmeleri
  // class_evaluation_marks her kriter için ayrı satırdır; criteria_index = -1 öğrencinin özel notudur.
  if (dump.class_evaluations && dump.class_evaluations.length) {
    const evalMap = {};
    dump.class_evaluations.forEach(ev => { evalMap[ev.id] = ev; });
    const ceRows = [];
    (dump.class_evaluation_marks || []).forEach(m => {
      const ev = evalMap[m.evaluation_id];
      if (!ev) return;
      const isNote = m.criteria_index === -1;
      ceRows.push({
        'Sınıf': classMap[ev.class_id] || '',
        'Dönem': ev.period,
        'Öğrenci': studentMap[m.student_id] || m.student_id,
        'Kriter': isNote ? 'Özel Not' : ((ev.criteria || [])[m.criteria_index] || ''),
        'İşaretli': isNote ? '' : (m.checked ? 'Evet' : 'Hayır'),
        'Not': m.note || ''
      });
    });
    addSheet(ceRows, 'Sınıf Değerlendirme');
  }

  if (!wb.SheetNames.length) {
    addSheet([{ 'Durum': 'Kayıtlı veri bulunamadı' }], 'Özet');
  }

  return wb;
}

async function main() {
  // Bilgisayardaki otomatik yedek (scripts/yerel_yedek.ps1) BACKUP_DIR ile kendi klasörünü verir
  const backupDir = (process.env.BACKUP_DIR || '').trim() || path.join(process.cwd(), 'backups');
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  let allUsers = [];
  try {
    console.log('Kullanıcı listesi Supabase Auth API üzerinden sorgulanıyor...');
    const res = await sb.auth.admin.listUsers({ page: 1, perPage: 1000 });
    if (res.error) {
      console.warn('  ⚠️ Auth API hatası döndü:', res.error.message || res.error);
    } else {
      allUsers = res.data?.users || [];
      console.log('  Auth API: ' + allUsers.length + ' kullanıcı bulundu.');
    }
  } catch (authErr) {
    console.warn('  ⚠️ Supabase Auth listUsers çağrısı atlandı (' + (authErr.message || authErr) + ').');
    console.log('  🔄 Veritabanındaki aktif sınıflar ve öğretmen katalogu üzerinden otomatik eşleme yapılıyor...');
  }

  // Veritabanında sınıfı olan tüm owner_id'leri bul
  const { data: classRows, error: classListErr } = await sb.from('classes').select('owner_id');
  if (classListErr) {
    console.warn('  ⚠️ classes tablosu sorgu uyarısı:', classListErr.message);
  }
  const activeOwnerIds = [...new Set((classRows || []).map(c => c.owner_id).filter(Boolean))];
  console.log('  Aktif sınıfı bulunan öğretmen sayısı (owner_id):', activeOwnerIds.length);

  // Öğretmen haritası: owner_id -> { id, username, email }
  const teacherMap = new Map();

  // 1. Auth API'den gelen geçerli kullanıcılar
  for (const u of allUsers) {
    if (!u || !u.id) continue;
    const uName = (u.user_metadata?.username || (u.email ? u.email.split('@')[0] : '')).toLowerCase();
    if (uName === 'admin' || u.email === 'admin@takip.local') continue;
    const username = u.user_metadata?.username || (u.email ? u.email.split('@')[0] : 'ogretmen_' + u.id.slice(0, 8));
    teacherMap.set(u.id, {
      id: u.id,
      username,
      email: u.email || `${username}@takip.local`
    });
  }

  // 2. Önceden tanımlı öğretmen katalogu
  for (const pt of PREDEFINED_TEACHERS) {
    if (!teacherMap.has(pt.id)) {
      teacherMap.set(pt.id, {
        id: pt.id,
        username: pt.username,
        email: pt.email
      });
    }
  }

  // 3. Veritabanında sınıfı olan ancak henüz map'te olmayan owner_id'ler
  for (const oid of activeOwnerIds) {
    if (!teacherMap.has(oid)) {
      try {
        const { data: uData, error: uErr } = await sb.auth.admin.getUserById(oid);
        if (!uErr && uData?.user) {
          const u = uData.user;
          const uName = (u.user_metadata?.username || (u.email ? u.email.split('@')[0] : '')).toLowerCase();
          if (uName !== 'admin' && u.email !== 'admin@takip.local') {
            const username = u.user_metadata?.username || (u.email ? u.email.split('@')[0] : 'ogretmen_' + oid.slice(0, 8));
            teacherMap.set(oid, {
              id: oid,
              username,
              email: u.email || `${username}@takip.local`
            });
            continue;
          }
        }
      } catch (e) {
        // yoksay
      }
      teacherMap.set(oid, {
        id: oid,
        username: 'ogretmen_' + oid.slice(0, 8),
        email: `ogretmen_${oid.slice(0, 8)}@takip.local`
      });
    }
  }

  let targetUsers = Array.from(teacherMap.values());
  if (TEACHER_USERNAME) {
    const filterKey = TEACHER_USERNAME.toLowerCase().replace(/@takip\.local$/, '');
    targetUsers = targetUsers.filter(u => {
      const uName = (u.username || '').toLowerCase();
      const uEmail = (u.email || '').toLowerCase();
      return uName === filterKey || uEmail === filterKey || uEmail.startsWith(filterKey + '@');
    });
    console.log('  Filtre uygulandı (' + TEACHER_USERNAME + '): ' + targetUsers.length + ' öğretmen hedeflendi.');
  } else {
    console.log('  Toplam kontrol edilecek öğretmen sayısı: ' + targetUsers.length);
  }

  if (!targetUsers.length) {
    console.log('Yedeklenecek öğretmen bulunamadı.');
    return;
  }

  const dateStr = timestampStrTR();
  const drive = getDriveClient();
  let completedCount = 0;
  const failures = [];
  // GitHub Actions'ta yedeğin tek kalıcı yeri Drive; Drive yoksa yedek kaybolur.
  if (process.env.CI && !drive) {
    console.error('❌ Google Drive istemcisi kurulamadı; yedekler hiçbir yere kaydedilemeyecek.');
    failures.push('Drive yapılandırması');
  }

  for (const user of targetUsers) {
    const rawName = user.username || (user.email ? user.email.split('@')[0] : 'ogretmen_' + user.id.slice(0, 8));
    const teacherName = rawName.replace(/[\\/:*?"<>|]/g, '_');
    console.log('\n----------------------------------------');
    console.log('Öğretmen: ' + teacherName + ' (' + (user.email || 'belirtilmedi') + ') verileri çekiliyor...');

    try {
      const dump = await fetchOwnerScopedTables(user.id);
      const classCount = (dump.classes || []).length;
      const studentCount = (dump.students || []).length;
      console.log('  ' + classCount + ' sınıf, ' + studentCount + ' öğrenci bulundu.');

      if (classCount === 0 && studentCount === 0) {
        console.log('  Kayıtlı sınıf veya öğrenci bulunmadığı için bu öğretmen atlanıyor.');
        continue;
      }

      const payload = {
        teacher_username: teacherName,
        teacher_email: user.email || `${teacherName}@takip.local`,
        teacher_id: user.id,
        generated_at: new Date().toISOString(),
        ...dump,
      };

      // 1. JSON Yedeğini diske yaz
      // Dosya adı kayıt tarihiyle başlar; böylece klasörde tarihe göre sıralanır
      const jsonFilename = dateStr + '_' + teacherName + '.json';
      const jsonPath = path.join(backupDir, jsonFilename);
      const jsonBuf = Buffer.from(JSON.stringify(payload, null, 2), 'utf-8');
      fs.writeFileSync(jsonPath, jsonBuf);
      console.log('  ✓ JSON yedeği oluşturuldu: ' + jsonFilename + ' (' + jsonBuf.length + ' byte)');

      // 2. Excel (.xlsx) Yedeğini diske yaz
      const excelFilename = dateStr + '_' + teacherName + '.xlsx';
      const excelPath = path.join(backupDir, excelFilename);
      try {
        const wb = buildExcelBackup(dump);
        XLSX.writeFile(wb, excelPath);
        console.log('  ✓ Excel yedeği oluşturuldu: ' + excelFilename);
      } catch (e) {
        console.warn('  ⚠️ Excel yedeği oluşturulurken hata:', e.message);
        failures.push(teacherName + ' (Excel)');
      }

      // 3. İsteğe bağlı Google Drive yüklemesi (eğer ayarlıysa)
      if (drive && GOOGLE_DRIVE_FOLDER_ID) {
        try {
          const stream = Readable.from(jsonBuf);
          await drive.files.create({
            requestBody: { name: jsonFilename, parents: [GOOGLE_DRIVE_FOLDER_ID] },
            media: { mimeType: 'application/json', body: stream },
            fields: 'id',
          });
          console.log('  ✓ Google Drive\'a yüklendi: ' + jsonFilename);
        } catch (uploadErr) {
          console.warn('  ⚠️ Google Drive yüklemesi başarısız (' + uploadErr.message + ')');
          failures.push(teacherName + ' (Drive)');
        }
      }

      completedCount++;
    } catch (teacherErr) {
      console.error(`  ❌ ${teacherName} yedeği alınırken hata oluştu:`, teacherErr.message || teacherErr);
      failures.push(teacherName);
    }
  }

  console.log('\n========================================');
  console.log('Yedekleme süreci tamamlandı. Toplam ' + completedCount + ' öğretmenin yedeği hazırlandı.');
  if (failures.length) {
    console.error('❌ Sorunlu yedekler: ' + failures.join(', '));
    process.exitCode = 1;
  }
}

main().catch(err => {
  console.error('\nYedekleme işlemi sırasında kritik hata:', err);
  process.exit(1);
});
