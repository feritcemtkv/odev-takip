import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

const SUPABASE_URL = 'https://miekldpkuclbinclnvvu.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();

if (!SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌ Hata: SUPABASE_SERVICE_ROLE_KEY ortam değişkeni tanımlı değil.');
  console.error('Kullanım: SUPABASE_SERVICE_ROLE_KEY="anahtar" node scripts/restore.mjs <yedek_dosyasi.json>');
  process.exit(1);
}

const targetFile = process.argv[2];
if (!targetFile) {
  console.error('❌ Hata: Geri yüklenecek yedek dosyası belirtilmedi.');
  console.error('Örnek: node scripts/restore.mjs backups/Ahmet_yedek_2026-09-24_23-00.json');
  process.exit(1);
}

if (!fs.existsSync(targetFile)) {
  console.error('❌ Hata: Dosya bulunamadı:', targetFile);
  process.exit(1);
}

const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

async function restore() {
  console.log('📦 Yedek dosyası okunuyor:', targetFile);
  const raw = fs.readFileSync(targetFile, 'utf-8');
  const data = JSON.parse(raw);

  console.log('\n--- Yedek Bilgileri ---');
  console.log('Öğretmen:', data.teacher_username || data.teacher_email || 'Bilinmiyor');
  console.log('Kullanıcı ID:', data.teacher_id || 'Bilinmiyor');
  console.log('Tarih:', data.generated_at || 'Bilinmiyor');
  console.log('Sınıf Sayısı:', (data.classes || []).length);
  console.log('Öğrenci Sayısı:', (data.students || []).length);
  console.log('------------------------\n');

  const targetOwnerId = process.argv[3] || data.teacher_id;
  if (targetOwnerId) {
    console.log('Hedef Öğretmen (owner_id):', targetOwnerId);
  }

  const upsertInChunks = async (table, rows, onConflict, label) => {
    if (!rows || !rows.length) return;
    const CHUNK = 50;
    for (let i = 0; i < rows.length; i += CHUNK) {
      const chunk = rows.slice(i, i + CHUNK);
      const { error } = await sb.from(table).upsert(chunk, { onConflict });
      if (error) console.error(`  Hata (${label || table}):`, error.message);
    }
  };

  // 1. Sınıflar
  if (data.classes && data.classes.length) {
    const classesToUpsert = data.classes.map(c => ({
      ...c,
      owner_id: targetOwnerId || c.owner_id
    }));
    console.log('1. Sınıflar yükleniyor (' + classesToUpsert.length + ')...');
    await upsertInChunks('classes', classesToUpsert, 'id', 'classes');
  }

  // 2. Öğrenciler
  if (data.students && data.students.length) {
    console.log('2. Öğrenciler yükleniyor (' + data.students.length + ')...');
    await upsertInChunks('students', data.students, 'id', 'students');
  }

  // 3. Ödevler ve Ödev Durumları
  if (data.homeworks && data.homeworks.length) {
    console.log('3. Ödev tanımları yükleniyor (' + data.homeworks.length + ')...');
    await upsertInChunks('homeworks', data.homeworks, 'class_id,slot_no', 'homeworks');
  }
  if (data.homework_status && data.homework_status.length) {
    console.log('   Ödev durumları yükleniyor (' + data.homework_status.length + ')...');
    await upsertInChunks('homework_status', data.homework_status, 'student_id,slot_no', 'homework_status');
  }

  // 4. KDS Sınavları ve Puanları
  if (data.quizzes && data.quizzes.length) {
    console.log('4. KDS sınavları yükleniyor (' + data.quizzes.length + ')...');
    await upsertInChunks('quizzes', data.quizzes, 'class_id,slot_no', 'quizzes');
  }
  if (data.quiz_scores && data.quiz_scores.length) {
    console.log('   KDS notları yükleniyor (' + data.quiz_scores.length + ')...');
    await upsertInChunks('quiz_scores', data.quiz_scores, 'student_id,slot_no', 'quiz_scores');
  }

  // 5. Performans Görevleri ve Rubrikler
  if (data.performance_tasks && data.performance_tasks.length) {
    console.log('5. Performans ödevleri yükleniyor (' + data.performance_tasks.length + ')...');
    await upsertInChunks('performance_tasks', data.performance_tasks, 'class_id,slot_no', 'performance_tasks');
  }
  if (data.rubrics && data.rubrics.length) {
    console.log('   Rubrik ölçütleri yükleniyor (' + data.rubrics.length + ')...');
    await upsertInChunks('rubrics', data.rubrics, 'class_id,level', 'rubrics');
  }
  if (data.rubric_scores && data.rubric_scores.length) {
    console.log('   Rubrik puanları yükleniyor (' + data.rubric_scores.length + ')...');
    await upsertInChunks('rubric_scores', data.rubric_scores, 'student_id,level,criteria_index', 'rubric_scores');
  }

  // 6. Deneme Sınavları (TYT/AYT)
  if (data.deneme_exams && data.deneme_exams.length) {
    console.log('6. Deneme sınavları yükleniyor (' + data.deneme_exams.length + ')...');
    await upsertInChunks('deneme_exams', data.deneme_exams, 'id', 'deneme_exams');
  }
  if (data.deneme_scores && data.deneme_scores.length) {
    console.log('   Deneme notları yükleniyor (' + data.deneme_scores.length + ')...');
    await upsertInChunks('deneme_scores', data.deneme_scores, 'exam_id,student_id,subject', 'deneme_scores');
  }

  // 7. Rehberlik ve Danışmanlık
  if (data.counseling_notes && data.counseling_notes.length) {
    console.log('7. Görüşme notları yükleniyor (' + data.counseling_notes.length + ')...');
    await upsertInChunks('counseling_notes', data.counseling_notes, 'id', 'counseling_notes');
  }
  if (data.university_goals && data.university_goals.length) {
    console.log('   Üniversite hedefleri yükleniyor (' + data.university_goals.length + ')...');
    await upsertInChunks('university_goals', data.university_goals, 'id', 'university_goals');
  }
  if (data.abroad_consulting && data.abroad_consulting.length) {
    console.log('   Yurtdışı danışmanlık yükleniyor (' + data.abroad_consulting.length + ')...');
    await upsertInChunks('abroad_consulting', data.abroad_consulting, 'student_id', 'abroad_consulting');
  }
  if (data.class_evaluations && data.class_evaluations.length) {
    console.log('   Sınıf değerlendirmeleri yükleniyor (' + data.class_evaluations.length + ')...');
    await upsertInChunks('class_evaluations', data.class_evaluations, 'id', 'class_evaluations');
  }
  if (data.class_evaluation_marks && data.class_evaluation_marks.length) {
    console.log('   Sınıf değerlendirme işaretlemeleri yükleniyor (' + data.class_evaluation_marks.length + ')...');
    await upsertInChunks('class_evaluation_marks', data.class_evaluation_marks, 'evaluation_id,student_id', 'class_evaluation_marks');
  }

  console.log('\n✅ Geri yükleme işlemi başarıyla tamamlandı!');
}

restore().catch(err => {
  console.error('\n❌ Geri yükleme sırasında kritik hata oluştu:', err);
  process.exit(1);
});
