# Bilgisayar her açıldığında tüm öğretmenlerin yedeğini alır.
# Yedekler proje klasörünün yanındaki "odev-takip-yedekler" klasörüne kaydedilir,
# dosya adları kayıt tarihiyle başlar (ör. 2026-10-26_14-30_feritcem.xlsx).
# 10 günden eski yedekler, yeni yedek başarıyla alındıktan sonra silinir.
# Supabase anahtarı proje klasöründeki .env dosyasından okunur (SUPABASE_SERVICE_ROLE_KEY=...).

$ErrorActionPreference = 'Stop'
$SAKLAMA_GUN = 10

$proje = Split-Path -Parent $PSScriptRoot
$hedef = Join-Path (Split-Path -Parent $proje) 'odev-takip-yedekler'
$log = Join-Path $hedef 'yedekleme.log'
New-Item -ItemType Directory -Force -Path $hedef | Out-Null

function Yaz($mesaj) {
  $satir = (Get-Date -Format 'yyyy-MM-dd HH:mm:ss') + '  ' + $mesaj
  Add-Content -Path $log -Value $satir -Encoding UTF8
}

try {
  # Açılışta internet birkaç dakika geç gelebilir; en fazla 5 dakika bekle
  $bagli = $false
  for ($i = 0; $i -lt 30; $i++) {
    try { [System.Net.Dns]::GetHostAddresses('miekldpkuclbinclnvvu.supabase.co') | Out-Null; $bagli = $true; break }
    catch { Start-Sleep -Seconds 10 }
  }
  if (-not $bagli) { Yaz 'HATA: Internet baglantisi yok, yedek alinamadi.'; exit 1 }

  $envDosya = Join-Path $proje '.env'
  if (-not (Test-Path $envDosya)) { Yaz 'HATA: .env dosyasi bulunamadi.'; exit 1 }

  $node = (Get-Command node -ErrorAction Stop).Source
  $env:BACKUP_DIR = $hedef
  Remove-Item Env:TEACHER_USERNAME -ErrorAction SilentlyContinue

  Yaz 'Yedekleme basladi.'
  Push-Location $proje
  # Node uyarilari stderr'e yazar; PowerShell 5.1 bunlari hata sanmasin
  $ErrorActionPreference = 'Continue'
  try {
    $cikti = & $node --env-file=$envDosya .github/scripts/backup.mjs 2>&1 | ForEach-Object { "$_" } | Out-String
    $kod = $LASTEXITCODE
  } finally { Pop-Location; $ErrorActionPreference = 'Stop' }
  Add-Content -Path $log -Value $cikti -Encoding UTF8

  if ($kod -ne 0) { Yaz "HATA: Yedekleme basarisiz (cikis kodu $kod). Eski yedekler silinmedi."; exit $kod }

  # Sadece bu scriptin olusturdugu tarihli dosyalara dokun
  $sinir = (Get-Date).AddDays(-$SAKLAMA_GUN)
  $eskiler = Get-ChildItem -Path $hedef -File |
    Where-Object { $_.Name -match '^\d{4}-\d{2}-\d{2}_\d{2}-\d{2}_.+\.(json|xlsx)$' -and $_.LastWriteTime -lt $sinir } |
    Sort-Object LastWriteTime
  foreach ($f in $eskiler) { Remove-Item -LiteralPath $f.FullName -Force }
  Yaz ("Yedekleme tamamlandi. Silinen eski dosya: " + @($eskiler).Count)

  # Log dosyasi sismesin
  $satirlar = Get-Content -Path $log -Encoding UTF8
  if ($satirlar.Count -gt 2000) { $satirlar | Select-Object -Last 1000 | Set-Content -Path $log -Encoding UTF8 }
}
catch {
  Yaz ('HATA: ' + $_.Exception.Message)
  exit 1
}
