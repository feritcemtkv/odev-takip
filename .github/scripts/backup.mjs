import { createClient } from '@supabase/supabase-js';
import { google } from 'googleapis';
import { Readable } from 'stream';

const SUPABASE_URL = 'https://miekldpkuclbinclnvvu.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
const TEACHER_USERNAME = (process.env.TEACHER_USERNAME || '').trim();
const GOOGLE_CLIENT_ID = (process.env.GOOGLE_CLIENT_ID || '').trim();
const GOOGLE_CLIENT_SECRET = (process.env.GOOGLE_CLIENT_SECRET || '').trim();
const GOOGLE_REFRESH_TOKEN = (process.env.GOOGLE_REFRESH_TOKEN || '').trim();
const GOOGLE_DRIVE_FOLDER_ID = (process.env.GOOGLE_DRIVE_FOLDER_ID || '').trim();

const required = {
  SUPABASE_SERVICE_ROLE_KEY, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET,
  GOOGLE_REFRESH_TOKEN, GOOGLE_DRIVE_FOLDER_ID,
};
const missing = Object.entries(required).filter(([, v]) => !v).map(([k]) => k);
if (missing.length) {
  console.error('Eksik veya boş secret(lar): ' + missing.join(', '));
  process.exit(1);
}

const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

function todayStr() { return new Date().toISOString().slice(0, 10); }
function timestampStrTR() {
  // Türkiye saatine çevir (UTC+3, DST yok) ve dosya adına uygun formatta döndür
  const d = new Date(Date.now() + 3 * 60 * 60 * 1000);
  const pad = n => String(n).padStart(2, '0');
  return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate())
    + '_' + pad(d.getUTCHours()) + '-' + pad(d.getUTCMinutes());
}

// Sadece BU öğretmenin kendi sınıflarını (owner_id ile) ve onlara bağlı
// öğrenci/ödev/not verilerini çeker — sistemdeki diğer öğretmenlerin
// verilerine dokunmaz.
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

async function main() {
  console.log('Google\'a (OAuth) giriş yapılıyor...');
  const oauth2Client = new google.auth.OAuth2(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET);
  oauth2Client.setCredentials({ refresh_token: GOOGLE_REFRESH_TOKEN });
  const drive = google.drive({ version: 'v3', auth: oauth2Client });

  console.log('Google Drive klasörüne erişim test ediliyor...');
  try {
    const folderCheck = await drive.files.get({
      fileId: GOOGLE_DRIVE_FOLDER_ID,
      fields: 'id, name, mimeType',
    });
    console.log('  Klasör bulundu: "' + folderCheck.data.name + '"');
  } catch (folderErr) {
    console.error('  Klasöre erişilemedi! GOOGLE_DRIVE_FOLDER_ID değerinin doğru olduğundan emin ol.');
    throw folderErr;
  }

  console.log('Kullanıcı listesi Supabase\'den alınıyor...');
  const { data: userList, error: userErr } = await sb.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (userErr) throw new Error('Kullanıcı listesi alınamadı: ' + userErr.message);

  const allUsers = userList.users || [];
  console.log('  Toplam ' + allUsers.length + ' kullanıcı bulundu.');

  // Eğer TEACHER_USERNAME belirtilmişse tek bir öğretmen, belirtilmemişse admin hariç tüm öğretmenler
  let targetUsers = allUsers;
  if (TEACHER_USERNAME) {
    const filterEmail = TEACHER_USERNAME.includes('@') ? TEACHER_USERNAME : TEACHER_USERNAME + '@takip.local';
    targetUsers = allUsers.filter(u => u.email === filterEmail || (u.user_metadata && u.user_metadata.username === TEACHER_USERNAME));
    console.log('  Filtre uygulandı (' + TEACHER_USERNAME + '): ' + targetUsers.length + ' kullanıcı hedeflendi.');
  } else {
    // Admin haricindeki tüm öğretmenleri dahil et
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
  let uploadedCount = 0;

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
    const buf = Buffer.from(JSON.stringify(payload, null, 2), 'utf-8');

    // Dosya adı formatı: [ogretmen_adi]_yedek_[tarih].json
    const filename = teacherName + '_yedek_' + dateStr + '.json';
    console.log('  Drive\'a yükleniyor: ' + filename + ' (' + buf.length + ' byte)...');

    const stream = Readable.from(buf);
    await drive.files.create({
      requestBody: { name: filename, parents: [GOOGLE_DRIVE_FOLDER_ID] },
      media: { mimeType: 'application/json', body: stream },
      fields: 'id',
    });
    console.log('  ✓ ' + filename + ' başarıyla yüklendi.');
    uploadedCount++;
  }

  console.log('\n========================================');
  console.log('Tüm yedekleme tamamlandı! Toplam ' + uploadedCount + ' öğretmenin yedeği Drive\'a yüklendi.');
}

main().catch(err => {
  console.error('Yedekleme başarısız:', err);
  process.exit(1);
});
