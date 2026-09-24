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

  // 1. Sınıflar
  if (data.classes && data.classes.length) {
    const classesToUpsert = data.classes.map(c => ({
      ...c,
      owner_id: targetOwnerId || c.owner_id
    }));
    console.log('1. Sınıflar yükleniyor (' + classesToUpsert.length + ')...');
    const { error } = await sb.from('classes').upsert(classesToUpsert, { onConflict: 'id' });
    if (error) console.error('  Hata (classes):', error.message);
  }

  // 2. Öğrenciler
  if (data.students && data.students.length) {
    console.log('2. Öğrenciler yükleniyor (' + data.students.length + ')...');
    const { error } = await sb.from('students').upsert(data.students, { onConflict: 'id' });
    if (error) console.error('  Hata (students):', error.message);
  }

  // 3. Ödevler ve Ödev Durumları
  if (data.homeworks && data.homeworks.length) {
    console.log('3. Ödev tanımları yükleniyor (' + data.homeworks.length + ')...');
    const { error } = await sb.from('homeworks').upsert(data.homeworks, { onConflict: 'class_id,slot_no' });
    if (error) console.error('  Hata (homeworks):', error.message);
  }
  if (data.homework_status && data.homework_status.length) {
    console.log('   Ödev durumları yükleniyor (' + data.homework_status.length + ')...');
    const { error } = await sb.from('homework_status').upsert(data.homework_status, { onConflict: 'student_id,slot_no' });
    if (error) console.error('  Hata (homework_status):', error.message);
  }

  // 4. KDS Sınavları ve Puanları
  if (data.quizzes && data.quizzes.length) {
    console.log('4. KDS sınavları yükleniyor (' + data.quizzes.length + ')...');
    const { error } = await sb.from('quizzes').upsert(data.quizzes, { onConflict: 'class_id,slot_no' });
    if (error) console.error('  Hata (quizzes):', error.message);
  }
  if (data.quiz_scores && data.quiz_scores.length) {
    console.log('   KDS notları yükleniyor (' + data.quiz_scores.length + ')...');
    const { error } = await sb.from('quiz_scores').upsert(data.quiz_scores, { onConflict: 'student_id,slot_no' });
    if (error) console.error('  Hata (quiz_scores):', error.message);
  }

  // 5. Performans Görevleri ve Rubrikler
  if (data.performance_tasks && data.performance_tasks.length) {
    console.log('5. Performans ödevleri yükleniyor (' + data.performance_tasks.length + ')...');
    const { error } = await sb.from('performance_tasks').upsert(data.performance_tasks, { onConflict: 'class_id,slot_no' });
    if (error) console.error('  Hata (performance_tasks):', error.message);
  }
  if (data.rubrics && data.rubrics.length) {
    console.log('   Rubrik ölçütleri yükleniyor (' + data.rubrics.length + ')...');
    const { error } = await sb.from('rubrics').upsert(data.rubrics, { onConflict: 'class_id,level' });
    if (error) console.error('  Hata (rubrics):', error.message);
  }
  if (data.rubric_scores && data.rubric_scores.length) {
    console.log('   Rubrik puanları yükleniyor (' + data.rubric_scores.length + ')...');
    const { error } = await sb.from('rubric_scores').upsert(data.rubric_scores, { onConflict: 'student_id,level,criteria_index' });
    if (error) console.error('  Hata (rubric_scores):', error.message);
  }

  // 6. Deneme Sınavları (TYT/AYT)
  if (data.deneme_exams && data.deneme_exams.length) {
    console.log('6. Deneme sınavları yükleniyor (' + data.deneme_exams.length + ')...');
    const { error } = await sb.from('deneme_exams').upsert(data.deneme_exams, { onConflict: 'id' });
    if (error) console.error('  Hata (deneme_exams):', error.message);
  }
  if (data.deneme_scores && data.deneme_scores.length) {
    console.log('   Deneme notları yükleniyor (' + data.deneme_scores.length + ')...');
    const { error } = await sb.from('deneme_scores').upsert(data.deneme_scores, { onConflict: 'exam_id,student_id,subject' });
    if (error) console.error('  Hata (deneme_scores):', error.message);
  }

  // 7. Rehberlik ve Danışmanlık
  if (data.counseling_notes && data.counseling_notes.length) {
    console.log('7. Görüşme notları yükleniyor (' + data.counseling_notes.length + ')...');
    const { error } = await sb.from('counseling_notes').upsert(data.counseling_notes, { onConflict: 'id' });
    if (error) console.error('  Hata (counseling_notes):', error.message);
  }
  if (data.university_goals && data.university_goals.length) {
    console.log('   Üniversite hedefleri yükleniyor (' + data.university_goals.length + ')...');
    const { error } = await sb.from('university_goals').upsert(data.university_goals, { onConflict: 'id' });
    if (error) console.error('  Hata (university_goals):', error.message);
  }
  if (data.abroad_consulting && data.abroad_consulting.length) {
    console.log('   Yurtdışı danışmanlık yükleniyor (' + data.abroad_consulting.length + ')...');
    const { error } = await sb.from('abroad_consulting').upsert(data.abroad_consulting, { onConflict: 'student_id' });
    if (error) console.error('  Hata (abroad_consulting):', error.message);
  }
  if (data.class_evaluations && data.class_evaluations.length) {
    console.log('   Sınıf değerlendirmeleri yükleniyor (' + data.class_evaluations.length + ')...');
    const { error } = await sb.from('class_evaluations').upsert(data.class_evaluations, { onConflict: 'id' });
    if (error) console.error('  Hata (class_evaluations):', error.message);
  }
  if (data.class_evaluation_marks && data.class_evaluation_marks.length) {
    console.log('   Sınıf değerlendirme işaretlemeleri yükleniyor (' + data.class_evaluation_marks.length + ')...');
    const { error } = await sb.from('class_evaluation_marks').upsert(data.class_evaluation_marks, { onConflict: 'evaluation_id,student_id' });
    if (error) console.error('  Hata (class_evaluation_marks):', error.message);
  }

  console.log('\n✅ Geri yükleme işlemi başarıyla tamamlandı!');
}

restore().catch(err => {
  console.error('\n❌ Geri yükleme sırasında kritik hata oluştu:', err);
  process.exit(1);
});
