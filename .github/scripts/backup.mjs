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

async function fetchOwnerScopedTables(ownerId) {
  const dump = {};

  const { data: classes, error: classErr } = await sb.from('classes').select('*').eq('owner_id', ownerId);
  if (classErr) throw new Error('classes: ' + classErr.message);
  dump.classes = classes || [];
  const classIds = dump.classes.map(c => c.id);

  const byClassIds = async (table) => {
    if (!classIds.length) return [];
    const { data, error } = await sb.from(table).select('*').in('class_id', classIds);
    if (error) throw new Error(table + ': ' + error.message);
    return data || [];
  };
  const byStudentIds = async (table, studentIds) => {
    if (!studentIds.length) return [];
    const { data, error } = await sb.from(table).select('*').in('student_id', studentIds);
    if (error) throw new Error(table + ': ' + error.message);
    return data || [];
  };

  dump.students = await byClassIds('students');
  const studentIds = dump.students.map(s => s.id);

  dump.homeworks = await byClassIds('homeworks');
  dump.homework_status = await byStudentIds('homework_status', studentIds);

  dump.quizzes = await byClassIds('quizzes');
  dump.quiz_scores = await byStudentIds('quiz_scores', studentIds);

  dump.performance_tasks = await byClassIds('performance_tasks');
  dump.rubrics = await byClassIds('rubrics');
  dump.rubric_scores = await byStudentIds('rubric_scores', studentIds);

  dump.deneme_exams = await byClassIds('deneme_exams');
  const examIds = dump.deneme_exams.map(e => e.id);
  if (examIds.length) {
    const { data, error } = await sb.from('deneme_scores').select('*').in('exam_id', examIds);
    if (error) throw new Error('deneme_scores: ' + error.message);
    dump.deneme_scores = data || [];
  } else {
    dump.deneme_scores = [];
  }

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
  if (dump.class_evaluations && dump.class_evaluations.length) {
    const ceRows = [];
    (dump.class_evaluations || []).forEach(ev => {
      (dump.class_evaluation_marks || []).forEach(m => {
        ceRows.push({
          'Sınıf': classMap[ev.class_id] || '',
          'Dönem': ev.period,
          'Öğrenci': studentMap[m.student_id] || m.student_id,
          'Özel Not': (m.marks && m.marks[-1] && m.marks[-1].note) || ''
        });
      });
    });
    addSheet(ceRows, 'Sınıf Değerlendirme');
  }

  return wb;
}

async function main() {
  const backupDir = path.join(process.cwd(), 'backups');
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  console.log('Kullanıcı listesi Supabase\'den alınıyor...');
  const res = await sb.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (res.error) throw res.error;
  const allUsers = res.data.users || [];
  console.log('  Toplam ' + allUsers.length + ' kullanıcı bulundu.');

  let targetUsers = allUsers;
  if (TEACHER_USERNAME) {
    const filterEmail = TEACHER_USERNAME.includes('@') ? TEACHER_USERNAME : TEACHER_USERNAME + '@takip.local';
    targetUsers = allUsers.filter(u => u.email === filterEmail || (u.user_metadata && u.user_metadata.username === TEACHER_USERNAME));
    console.log('  Filtre uygulandı (' + TEACHER_USERNAME + '): ' + targetUsers.length + ' kullanıcı hedeflendi.');
  } else {
    targetUsers = allUsers.filter(u => {
      const uName = (u.user_metadata?.username || u.email?.split('@')[0] || '').toLowerCase();
      return uName !== 'admin' && u.email !== 'admin@takip.local';
    });
    console.log('  Yedeklenecek öğretmen sayısı: ' + targetUsers.length);
  }

  if (!targetUsers.length) {
    console.log('Yedeklenecek öğretmen bulunamadı.');
    return;
  }

  const dateStr = timestampStrTR();
  const drive = getDriveClient();
  let completedCount = 0;

  for (const user of targetUsers) {
    const teacherName = (user.user_metadata?.username || user.email.split('@')[0]).replace(/[\\/:*?"<>|]/g, '_');
    console.log('\n----------------------------------------');
    console.log('Öğretmen: ' + teacherName + ' (' + user.email + ') verileri çekiliyor...');

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
      teacher_email: user.email,
      teacher_id: user.id,
      generated_at: new Date().toISOString(),
      ...dump,
    };

    // 1. JSON Yedeğini diske yaz
    const jsonFilename = teacherName + '_yedek_' + dateStr + '.json';
    const jsonPath = path.join(backupDir, jsonFilename);
    const jsonBuf = Buffer.from(JSON.stringify(payload, null, 2), 'utf-8');
    fs.writeFileSync(jsonPath, jsonBuf);
    console.log('  ✓ JSON yedeği oluşturuldu: ' + jsonFilename + ' (' + jsonBuf.length + ' byte)');

    // 2. Excel (.xlsx) Yedeğini diske yaz
    const excelFilename = teacherName + '_yedek_' + dateStr + '.xlsx';
    const excelPath = path.join(backupDir, excelFilename);
    try {
      const wb = buildExcelBackup(dump);
      XLSX.writeFile(wb, excelPath);
      console.log('  ✓ Excel yedeği oluşturuldu: ' + excelFilename);
    } catch (e) {
      console.warn('  ⚠️ Excel yedeği oluşturulurken hata:', e.message);
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
        console.warn('  ⚠️ Google Drive yüklemesi atlandı (' + uploadErr.message + ')');
      }
    }

    completedCount++;
  }

  console.log('\n========================================');
  console.log('Tüm yedekleme başarıyla tamamlandı! Toplam ' + completedCount + ' öğretmenin yedeği hazırlandı.');
}

main().catch(err => {
  console.error('\nYedekleme işlemi sırasında hata:', err);
  process.exit(1);
});
