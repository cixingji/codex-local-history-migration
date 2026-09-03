$ErrorActionPreference = 'Stop'

$sourceRoot = Join-Path $env:USERPROFILE '.codex'
$desktop = [Environment]::GetFolderPath('Desktop')
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$backupRoot = Join-Path $desktop "Codex-Target-PreMerge-Backup-$stamp"
$processNames = @(
  'codex',
  'codex-code-mode-host',
  'codex-plus-plus',
  'codex-plus-plus-manager'
)

function Get-RelativePath([string]$root, [string]$fullPath) {
  return $fullPath.Substring($root.TrimEnd('\').Length + 1)
}

try {
  Write-Host 'Codex target pre-merge backup'
  Write-Host "Source: $sourceRoot"
  Write-Host "Backup: $backupRoot"
  Write-Host ''

  if (-not (Test-Path -LiteralPath $sourceRoot -PathType Container)) {
    throw "Source directory does not exist: $sourceRoot"
  }

  $deadline = (Get-Date).AddSeconds(30)
  do {
    $running = @(Get-Process -Name $processNames -ErrorAction SilentlyContinue)
    if ($running.Count -eq 0) { break }
    Write-Host 'Waiting for Codex and Codex++ processes to exit...'
    Start-Sleep -Seconds 2
  } while ((Get-Date) -lt $deadline)

  if ($running.Count -gt 0) {
    $names = ($running | Select-Object -ExpandProperty ProcessName -Unique) -join ', '
    throw "Codex is still running: $names. Close it completely, then run this file again."
  }

  foreach ($required in @('sessions', 'state_5.sqlite', 'session_index.jsonl')) {
    $requiredPath = Join-Path $sourceRoot $required
    if (-not (Test-Path -LiteralPath $requiredPath)) {
      throw "Required source path is missing: $requiredPath"
    }
  }

  if (Test-Path -LiteralPath $backupRoot) {
    throw "Backup destination already exists: $backupRoot"
  }

  New-Item -ItemType Directory -Path $backupRoot | Out-Null
  Write-Host 'Copying the complete target .codex directory...'
  $robocopyOutput = & robocopy.exe $sourceRoot $backupRoot /E /COPY:DAT /R:1 /W:1 /XJ /NP
  $robocopyCode = $LASTEXITCODE
  if ($robocopyCode -gt 7) {
    throw "Robocopy failed with exit code $robocopyCode. The partial backup was retained for inspection."
  }

  Write-Host 'Verifying every copied file with SHA-256...'
  $sourceFiles = @(Get-ChildItem -LiteralPath $sourceRoot -Force -Recurse -File)
  $backupFilesBeforeReports = @(Get-ChildItem -LiteralPath $backupRoot -Force -Recurse -File)
  $manifestFiles = New-Object System.Collections.Generic.List[object]
  $mismatches = New-Object System.Collections.Generic.List[string]

  foreach ($sourceFile in $sourceFiles) {
    $relative = Get-RelativePath $sourceRoot $sourceFile.FullName
    $backupFile = Join-Path $backupRoot $relative
    if (-not (Test-Path -LiteralPath $backupFile -PathType Leaf)) {
      $mismatches.Add("Missing: $relative")
      continue
    }
    $sourceHash = (Get-FileHash -LiteralPath $sourceFile.FullName -Algorithm SHA256).Hash
    $backupHash = (Get-FileHash -LiteralPath $backupFile -Algorithm SHA256).Hash
    if ($sourceFile.Length -ne (Get-Item -LiteralPath $backupFile).Length) {
      $mismatches.Add("Size mismatch: $relative")
      continue
    }
    if ($sourceHash -ne $backupHash) {
      $mismatches.Add("Hash mismatch: $relative")
      continue
    }
    $manifestFiles.Add([ordered]@{
      path = $relative
      size = $sourceFile.Length
      sha256 = $sourceHash.ToLowerInvariant()
    })
  }

  $sourceSessionCount = @(
    Get-ChildItem -LiteralPath (Join-Path $sourceRoot 'sessions') -Recurse -File -Filter '*.jsonl'
  ).Count
  $backupSessionCount = @(
    Get-ChildItem -LiteralPath (Join-Path $backupRoot 'sessions') -Recurse -File -Filter '*.jsonl'
  ).Count
  if ($sourceFiles.Count -ne $backupFilesBeforeReports.Count) {
    $mismatches.Add(
      "File count mismatch: source=$($sourceFiles.Count), backup=$($backupFilesBeforeReports.Count)"
    )
  }
  if ($sourceSessionCount -ne $backupSessionCount) {
    $mismatches.Add(
      "Session count mismatch: source=$sourceSessionCount, backup=$backupSessionCount"
    )
  }

  $verification = [ordered]@{
    version = 1
    createdAt = (Get-Date).ToString('o')
    source = $sourceRoot
    backup = $backupRoot
    robocopyExitCode = $robocopyCode
    sourceFileCount = $sourceFiles.Count
    backupFileCountBeforeReports = $backupFilesBeforeReports.Count
    sourceSessionCount = $sourceSessionCount
    backupSessionCount = $backupSessionCount
    mismatchCount = $mismatches.Count
    mismatches = @($mismatches)
    files = @($manifestFiles)
  }
  $json = $verification | ConvertTo-Json -Depth 6
  $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
  [System.IO.File]::WriteAllText(
    (Join-Path $backupRoot 'backup-verification.json'),
    $json,
    $utf8NoBom
  )
  [System.IO.File]::WriteAllLines(
    (Join-Path $backupRoot 'robocopy.log'),
    [string[]]$robocopyOutput,
    $utf8NoBom
  )

  if ($mismatches.Count -gt 0) {
    throw "Backup verification failed with $($mismatches.Count) mismatch(es). Backup retained: $backupRoot"
  }

  Write-Host ''
  Write-Host 'BACKUP VERIFIED SUCCESSFULLY.' -ForegroundColor Green
  Write-Host "Backup: $backupRoot"
  Write-Host "Files verified: $($sourceFiles.Count)"
  Write-Host "Sessions verified: $sourceSessionCount"
  Write-Host "Verification: $(Join-Path $backupRoot 'backup-verification.json')"
  exit 0
} catch {
  Write-Host ''
  Write-Host "BACKUP FAILED: $($_.Exception.Message)" -ForegroundColor Red
  exit 1
}
