<#
  pull-latest-backup.ps1
  Downloads the most recent Supabase DB backup artifact from GitHub Actions
  into the local workspace backups folder. Optionally decrypts + decompresses
  it into a restorable .sql file.

  This is the "local copy" half of the backup system. The GitHub Actions
  workflow (.github/workflows/db-backup.yml) already keeps a 90-day off-site
  copy; this script brings a dated copy down to your E: drive.

  Requirements (one-time):
    1. Install GitHub CLI:  https://cli.github.com/  (or: winget install GitHub.cli)
    2. Authenticate once:   gh auth login
    3. For decryption, install OpenSSL (bundled with Git for Windows at
       "C:\Program Files\Git\usr\bin\openssl.exe") - the script auto-detects it.

  Usage:
    # Download the newest encrypted backup only:
    powershell -ExecutionPolicy Bypass -File .\pull-latest-backup.ps1

    # Download AND decrypt to a .sql file (will prompt for the passphrase):
    powershell -ExecutionPolicy Bypass -File .\pull-latest-backup.ps1 -Decrypt
#>

param(
  [string]$Repo       = "teddytran-madekulture/made-kulture-studio",
  [string]$Workflow   = "db-backup.yml",
  [string]$DestDir    = "E:\AI Master Folder\Made Kulture\backups",
  [switch]$Decrypt
)

$ErrorActionPreference = "Stop"

function Find-OpenSSL {
  $candidates = @(
    "openssl.exe",
    "C:\Program Files\Git\usr\bin\openssl.exe",
    "C:\Program Files\Git\mingw64\bin\openssl.exe"
  )
  foreach ($c in $candidates) {
    $cmd = Get-Command $c -ErrorAction SilentlyContinue
    if ($cmd) { return $cmd.Source }
  }
  return $null
}

# --- checks ---
if (-not (Get-Command gh -ErrorAction SilentlyContinue)) {
  throw "GitHub CLI (gh) is not installed. Install from https://cli.github.com/ then run 'gh auth login'."
}

New-Item -ItemType Directory -Force -Path $DestDir | Out-Null

# --- find the most recent successful run of the backup workflow ---
Write-Host "Looking up latest successful backup run..." -ForegroundColor Cyan
$runId = gh run list --repo $Repo --workflow $Workflow --status success --limit 1 --json databaseId --jq ".[0].databaseId"
if (-not $runId) {
  throw "No successful runs found for $Workflow in $Repo. Run the workflow first (Actions tab > Run workflow)."
}
Write-Host "Latest successful run: $runId"

# --- download its artifact into a temp staging folder ---
$stamp   = Get-Date -Format "yyyy-MM-dd_HHmm"
$staging = Join-Path $DestDir "_dl_$stamp"
New-Item -ItemType Directory -Force -Path $staging | Out-Null

Write-Host "Downloading artifact..." -ForegroundColor Cyan
gh run download $runId --repo $Repo --dir $staging

# gh extracts each artifact into a subfolder; find the .enc file
$enc = Get-ChildItem -Path $staging -Recurse -Filter "*.sql.gz.enc" | Select-Object -First 1
if (-not $enc) {
  throw "No .sql.gz.enc file found in the downloaded artifact."
}

$finalEnc = Join-Path $DestDir $enc.Name
Move-Item -Force $enc.FullName $finalEnc
Remove-Item -Recurse -Force $staging
Write-Host "Saved encrypted backup: $finalEnc" -ForegroundColor Green

# --- optional decrypt ---
if ($Decrypt) {
  $openssl = Find-OpenSSL
  if (-not $openssl) {
    Write-Warning "OpenSSL not found - cannot decrypt. Encrypted file is saved. Install Git for Windows (includes openssl) and re-run with -Decrypt."
  } else {
    $sec = Read-Host -AsSecureString "Enter BACKUP_PASSPHRASE"
    $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($sec)
    $pass = [Runtime.InteropServices.Marshal]::PtrToStringAuto($bstr)
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)

    $gz  = $finalEnc -replace "\.enc$", ""
    $sql = $gz -replace "\.gz$", ""

    Write-Host "Decrypting..." -ForegroundColor Cyan
    & $openssl enc -d -aes-256-cbc -pbkdf2 -pass ("pass:" + $pass) -in $finalEnc -out $gz
    $pass = $null

    Write-Host "Decompressing..." -ForegroundColor Cyan
    # Use .NET GZip so we don't depend on a separate gzip binary
    $in  = [IO.File]::OpenRead($gz)
    $out = [IO.File]::Create($sql)
    $gzs = New-Object IO.Compression.GzipStream($in, [IO.Compression.CompressionMode]::Decompress)
    $gzs.CopyTo($out); $gzs.Close(); $out.Close(); $in.Close()
    Remove-Item -Force $gz

    Write-Host "Restorable SQL written: $sql" -ForegroundColor Green
    Write-Host "Restore with:  psql `"<new-db-connection-string>`" -f `"$sql`"" -ForegroundColor Yellow
  }
}

# --- retention: keep the 30 most recent local .enc backups ---
$all = Get-ChildItem -Path $DestDir -Filter "*.sql.gz.enc" | Sort-Object LastWriteTime -Descending
if ($all.Count -gt 30) {
  $all | Select-Object -Skip 30 | ForEach-Object {
    Write-Host "Pruning old local backup: $($_.Name)"
    Remove-Item -Force $_.FullName
  }
}

Write-Host "Done." -ForegroundColor Green
