$ErrorActionPreference = 'Stop'
$taskRoot = Split-Path -Parent $PSScriptRoot
$extensionPath = Join-Path $taskRoot 'extension'
$distPath = Join-Path $taskRoot 'dist'
$archivePath = Join-Path $distPath 'MeasureLive-0.1.0.zip'
if (-not (Test-Path -LiteralPath (Join-Path $extensionPath 'manifest.json'))) { throw 'Extension manifest not found.' }
New-Item -ItemType Directory -Path $distPath -Force | Out-Null
Compress-Archive -Path (Join-Path $extensionPath '*') -DestinationPath $archivePath -Force
Write-Output "Installable extension ZIP: $archivePath"
