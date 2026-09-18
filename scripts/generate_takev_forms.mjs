import XLSX from 'xlsx';
import path from 'path';

const students = [
  { no: '353', name: 'Cihan Deniz Mutlu' },
  { no: '361', name: 'Tibet Mahir Savtak' },
  { no: '370', name: 'Orkun Yıldırım' },
  { no: '373', name: 'Mehmet Efe Kabakçı' },
  { no: '469', name: 'Erim Elbay' },
  { no: '549', name: 'Arda Kurt' },
  { no: '591', name: 'Nazenin Karakoç' },
  { no: '592', name: 'Demir Çorabatır' },
  { no: '637', name: 'Berfin Söğüt' },
  { no: '654', name: 'Linda Havlioğlu' },
  { no: '658', name: 'Karhan Esmez' },
  { no: '765', name: 'Arda Özdamar' },
  { no: '777', name: 'Efe Savaşır Özcan' },
  { no: '796', name: 'Levent Arslan' },
  { no: '803', name: 'Derin Kıranlı' },
  { no: '849', name: 'Nehir Mayra Yaman' },
  { no: '854', name: 'Aylin Akdoğan' },
  { no: '870', name: 'Defne Doğan' },
  { no: '871', name: 'Emre Onur Hınç' },
  { no: '882', name: 'Doğu Özgüler' },
  { no: '883', name: 'Ali Mahir Ertunç' },
  { no: '930', name: 'Kayra Öztürk' },
  { no: '951', name: 'Timur Hatipoğlu' },
  { no: '964', name: 'Demir Çiçek' }
];

export function createTakevWorkbook(studentList = students) {
  const wb = XLSX.utils.book_new();

  // ==========================================
  // TAB 1: Form-2 (Devam Ettiği Dershane/Etüt/Kurs)
  // ==========================================
  const form2Aoa = [];
  for (let i = 0; i < 5; i++) form2Aoa.push([]); // rows 1-5 blank
  // Row 6 (0-indexed 5)
  form2Aoa.push(['# Sıra', '# Okul No', 'Adı Soyadı', 'Devam Ettiği Dershane/Etüt/Kurs']);
  studentList.forEach((s, idx) => {
    form2Aoa.push([idx + 1, parseInt(s.no) || s.no, s.name, '']);
  });

  const wsForm2 = XLSX.utils.aoa_to_sheet(form2Aoa);
  wsForm2['!cols'] = [
    { wch: 8 },  // Sıra
    { wch: 12 }, // Okul No
    { wch: 28 }, // Adı Soyadı
    { wch: 38 }  // Dershane
  ];
  XLSX.utils.book_append_sheet(wb, wsForm2, 'Form-2');

  // ==========================================
  // TAB 2: Form-3a (Üniversite Hedefleri Çizelgesi)
  // ==========================================
  const maxRows = 22;
  const form3Aoa = Array.from({ length: maxRows }, () => []);
  const form3Merges = [];

  studentList.forEach((s, sIdx) => {
    const startCol = sIdx * 6; // 4 columns content + 2 empty spacer columns

    // Row 1: Title
    form3Aoa[0][startCol] = 'ÖZEL TAKEV Anadolu ve Fen Lisesi';
    form3Aoa[0][startCol + 3] = 'Form-3a';
    form3Merges.push({ s: { r: 0, c: startCol }, e: { r: 1, c: startCol + 2 } });

    // Row 3: Subtitle
    form3Aoa[3][startCol] = 'ÜNİVERSİTE HEDEFLERİ ÇİZELGESİ';
    form3Merges.push({ s: { r: 3, c: startCol }, e: { r: 3, c: startCol + 3 } });

    // Row 5: Öğrenci Adı Soyadı
    form3Aoa[4][startCol] = 'Öğrenci Adı Soyadı:';
    form3Aoa[4][startCol + 1] = s.name;
    form3Merges.push({ s: { r: 4, c: startCol + 1 }, e: { r: 4, c: startCol + 3 } });

    // Row 7: Headers
    form3Aoa[6][startCol] = 'HEDEFLENDİĞİ MESLEKLER (sırasıyla)';
    form3Merges.push({ s: { r: 6, c: startCol }, e: { r: 6, c: startCol + 1 } });
    form3Aoa[6][startCol + 2] = 'HEDEFLENDİĞİ ÜNİVERSİTELER (sırasıyla)';
    form3Merges.push({ s: { r: 6, c: startCol + 2 }, e: { r: 6, c: startCol + 3 } });

    // Row 8: Table Columns
    form3Aoa[7][startCol] = 'Sıra';
    form3Aoa[7][startCol + 1] = 'Meslek Adı';
    form3Aoa[7][startCol + 2] = 'Üniversite Adı';
    form3Merges.push({ s: { r: 7, c: startCol + 2 }, e: { r: 7, c: startCol + 3 } });

    // Rows 9 to 13: 5 choices
    for (let choice = 1; choice <= 5; choice++) {
      const r = 7 + choice; // 8, 9, 10, 11, 12
      form3Aoa[r][startCol] = choice;
      form3Aoa[r][startCol + 1] = '';
      form3Aoa[r][startCol + 2] = '';
      form3Merges.push({ s: { r: r, c: startCol + 2 }, e: { r: r, c: startCol + 3 } });
    }

    // Row 15 (idx 14): Almanya devam etme isteği
    form3Aoa[14][startCol] = "Eğitimine Almanya'da devam etme isteği";
    form3Merges.push({ s: { r: 14, c: startCol }, e: { r: 14, c: startCol + 3 } });

    // Row 16 (idx 15): EVET / HAYIR
    form3Aoa[15][startCol] = 'EVET';
    form3Aoa[15][startCol + 1] = '';
    form3Merges.push({ s: { r: 15, c: startCol }, e: { r: 15, c: startCol + 1 } });
    form3Aoa[15][startCol + 2] = 'HAYIR';
    form3Aoa[15][startCol + 3] = '';
    form3Merges.push({ s: { r: 15, c: startCol + 2 }, e: { r: 15, c: startCol + 3 } });

    // Row 17 (idx 16): Checkbox
    form3Aoa[16][startCol] = '☐';
    form3Merges.push({ s: { r: 16, c: startCol }, e: { r: 16, c: startCol + 1 } });
    form3Aoa[16][startCol + 2] = '☐';
    form3Merges.push({ s: { r: 16, c: startCol + 2 }, e: { r: 16, c: startCol + 3 } });

    // Row 19 (idx 18): Footer note
    form3Aoa[18][startCol] = '1. dönem başında uygulanır.';
    form3Merges.push({ s: { r: 18, c: startCol }, e: { r: 18, c: startCol + 3 } });
  });

  const wsForm3 = XLSX.utils.aoa_to_sheet(form3Aoa);
  wsForm3['!merges'] = form3Merges;
  
  // Set column widths
  const form3Cols = [];
  studentList.forEach(() => {
    form3Cols.push({ wch: 6 }, { wch: 22 }, { wch: 14 }, { wch: 14 }, { wch: 4 }, { wch: 4 });
  });
  wsForm3['!cols'] = form3Cols;
  XLSX.utils.book_append_sheet(wb, wsForm3, 'Form-3a');

  // ==========================================
  // TAB 3: Form-4 (Öğrenci Sınıf Durum Değerlendirmesi)
  // ==========================================
  const periods = [
    { title: '(Eylül-Kasım Arası Değerlendirme)' },
    { title: '(I.Dönem Sonu Arası Değerlendirme)' },
    { title: '(II. Dönem Başı-Nisan Arası Değerlendirme)' }
  ];

  const criteriaList = [
    'Derslerde çok aktif olan öğrenciler',
    'Derslerde pasif olan öğrenciler',
    'Derslerin akışını bozan öğrenciler',
    'Konsantrasyon yetersizliği olan öğrenciler',
    'Aşırı Sınav Kaygısı yaşayan öğrenciler',
    'Derslere düzenli çalışan öğrenciler',
    'Rehberlik görüşmesi gereken öğr.'
  ];

  const totalForm4Rows = 10 + studentList.length;
  const form4Aoa = Array.from({ length: totalForm4Rows }, () => []);
  const form4Merges = [];

  periods.forEach((p, pIdx) => {
    const pStartCol = pIdx * 13; // 11 cols data + 2 cols spacer

    // Row 1: Title
    form4Aoa[0][pStartCol] = 'ÖZEL TAKEV Anadolu ve Fen Lisesi';
    form4Aoa[0][pStartCol + 10] = 'Form-4';
    form4Merges.push({ s: { r: 0, c: pStartCol }, e: { r: 1, c: pStartCol + 9 } });

    // Row 3: Main Title
    form4Aoa[3][pStartCol] = 'ÖĞRENCİ SINIF DURUM DEĞERLENDİRMESİ';
    form4Merges.push({ s: { r: 3, c: pStartCol }, e: { r: 3, c: pStartCol + 10 } });

    // Row 4: Period Subtitle
    form4Aoa[4][pStartCol] = p.title;
    form4Merges.push({ s: { r: 4, c: pStartCol }, e: { r: 4, c: pStartCol + 10 } });

    // Row 6: Category
    form4Aoa[6][pStartCol + 3] = 'Tüm dersler düzeyinde GENEL DEĞERLENDİRME';
    form4Merges.push({ s: { r: 6, c: pStartCol + 3 }, e: { r: 6, c: pStartCol + 9 } });

    // Row 8 (idx 7): Table Headers
    form4Aoa[7][pStartCol] = 'Sıra';
    form4Aoa[7][pStartCol + 1] = 'Okul No';
    form4Aoa[7][pStartCol + 2] = 'Adı Soyadı';
    criteriaList.forEach((crit, cIdx) => {
      form4Aoa[7][pStartCol + 3 + cIdx] = crit;
    });
    form4Aoa[7][pStartCol + 10] = 'ÖZEL NOTLAR';

    // Rows 9+: Students
    studentList.forEach((s, sIdx) => {
      const rowIdx = 8 + sIdx;
      form4Aoa[rowIdx][pStartCol] = sIdx + 1;
      form4Aoa[rowIdx][pStartCol + 1] = parseInt(s.no) || s.no;
      form4Aoa[rowIdx][pStartCol + 2] = s.name;
      criteriaList.forEach((_, cIdx) => {
        form4Aoa[rowIdx][pStartCol + 3 + cIdx] = '☐';
      });
      form4Aoa[rowIdx][pStartCol + 10] = '';
    });
  });

  const wsForm4 = XLSX.utils.aoa_to_sheet(form4Aoa);
  wsForm4['!merges'] = form4Merges;

  // Widths
  const form4Cols = [];
  periods.forEach(() => {
    form4Cols.push(
      { wch: 6 },  // Sıra
      { wch: 10 }, // Okul No
      { wch: 24 }, // Adı Soyadı
      { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, // 7 criteria
      { wch: 20 }, // Özel Notlar
      { wch: 4 }, { wch: 4 } // Spacers
    );
  });
  wsForm4['!cols'] = form4Cols;
  XLSX.utils.book_append_sheet(wb, wsForm4, 'Form-4');

  return wb;
}

// Generate the Excel file
const wb = createTakevWorkbook(students);
const outputPath = path.resolve('./12D_TAKEV_Rehberlik_Formlari.xlsx');
XLSX.writeFile(wb, outputPath);
console.log('SUCCESS: Excel file created at ' + outputPath);
