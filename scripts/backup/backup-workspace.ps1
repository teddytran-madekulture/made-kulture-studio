<#
  backup-workspace.ps1
  Zips the Made Kulture workspace folder (docs, specs, Props source images,
  spreadsheets, daily logs) into a dated archive in the backups folder.

  Notes:
    - The website code is already backed up on GitHub, so this EXCLUDES the
      heavy/regenerable parts (node_modules, .git, .next) to keep the zip small.
    - Point $Source at the workspace root. The backups folder is excluded from
      itself so archives don't nest.
    - For true off-site safety, keep the $DestDir (or the whole workspace) synced
      to a cloud drive (OneDrive / Google Drive) as described in the runbook.

  Usage:
    powershell -ExecutionPolicy Bypass -File .\backup-workspace.ps1
#>

param(
  [string]$Source  = "E:\AI Master Folder\Made Kulture",
  [string]$DestDir = "E:\AI Master Folder\Made Kulture\backups"
)

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.IO.Compression.FileSystem

New-Item -ItemType Directory -Force -Path $DestDir | Out-Null
$stamp = Get-Date -Format "yyyy-MM-dd_HHmm"
$zip   = Join-Path $DestDir "workspace-$stamp.zip"

$exclude = @("\node_modules\", "\.git\", "\.next\", "\backups\")

Write-Host "Staging file list (excluding node_modules, .git, .next, backups)..." -ForegroundColor Cyan
$files = Get-ChildItem -Path $Source -Recurse -File | Where-Object {
  $p = $_.FullName
  -not ($exclude | Where-Object { $p -like "*$_*" })
}

Write-Host "Zipping $($files.Count) files..." -ForegroundColor Cyan
$fs  = [IO.File]::Create($zip)
$arc = New-Object IO.Compression.ZipArchive($fs, [IO.Compression.ZipArchiveMode]::Create)
$base = (Resolve-Path $Source).Path.TrimEnd('\') + '\'
foreach ($f in $files) {
  $rel = $f.FullName.Substring($base.Length)
  [void][IO.Compression.ZipFileExtensions]::CreateEntryFromFile($arc, $f.FullName, $rel, [IO.Compression.CompressionLevel]::Optimal)
}
$arc.Dispose(); $fs.Close()

$sizeMB = [math]::Round((Get-Item $zip).Length / 1MB, 1)
Write-Host "Wrote $zip ($sizeMB MB)" -ForegroundColor Green

# retention: keep the 8 most recent workspace zips
$all = Get-ChildItem -Path $DestDir -Filter "workspace-*.zip" | Sort-Object LastWriteTime -Descending
if ($all.Count -gt 8) {
  $all | Select-Object -Skip 8 | ForEach-Object {
    Write-Host "Pruning old workspace zip: $($_.Name)"
    Remove-Item -Force $_.FullName
  }
}
Write-Host "Done." -ForegroundColor Green
