import { createClient } from '@supabase/supabase-js';
import { google } from 'googleapis';
import { Readable } from 'stream';

const SUPABASE_URL = 'https://miekldpkuclbinclnvvu.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY?.trim();
const GOOGLE_DRIVE_FOLDER_ID = process.env.GOOGLE_DRIVE_FOLDER_ID?.trim();

if (!SUPABASE_SERVICE_ROLE_KEY || !GOOGLE_API_KEY || !GOOGLE_DRIVE_FOLDER_ID) {
  console.error('Eksik secret');
  process.exit(1);
}

const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const TABLES = ['classes', 'students', 'homeworks', 'homework_status', 'quizzes', 'quiz_scores', 'performance_tasks', 'rubrics', 'rubric_scores', 'deneme_exams', 'deneme_scores', 'counseling_notes', 'university_goals', 'abroad_consulting', 'class_evaluations', 'class_evaluation_marks'];

async function main() {
  const dump = {};
  for (const table of TABLES) {
    const { data, error } = await sb.from(table).select('*');
    if (error) throw error;
    dump[table] = data || [];
  }

  const payload = { generated_at: new Date().toISOString(), ...dump };
  const buf = Buffer.from(JSON.stringify(payload, null, 2));

  const drive = google.drive({ version: 'v3', auth: new google.auth.GoogleAuth({ credentials: { apiKey: GOOGLE_API_KEY } }) });
  const today = new Date().toISOString().slice(0, 10);
  const filename = 'yedek_' + today + '.json';

  await drive.files.create({
    requestBody: { name: filename, parents: [GOOGLE_DRIVE_FOLDER_ID] },
    media: { mimeType: 'application/json', body: Readable.from(buf) },
    fields: 'id'
  });

  console.log('✓ Yedek tamamlandı: ' + filename);
}

main().catch(err => { console.error(err.message); process.exit(1); });