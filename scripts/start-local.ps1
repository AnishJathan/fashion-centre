$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
$backendRoot = Join-Path $projectRoot 'backend'
if (-not (Test-Path (Join-Path $backendRoot 'target\fashion-centre-api-0.1.0.jar'))) { throw 'Build the backend first; see README.md.' }
if (Get-NetTCPConnection -State Listen -LocalPort 5173,8081 -ErrorAction SilentlyContinue) { throw 'Port 5173 or 8081 is already in use. Check the existing preview before starting another.' }
$apiProcess = Start-Process -FilePath 'java.exe' -ArgumentList @('-jar','target\fashion-centre-api-0.1.0.jar') -WorkingDirectory $backendRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $backendRoot 'server.log') -RedirectStandardError (Join-Path $backendRoot 'server-error.log') -PassThru
$webProcess = Start-Process -FilePath 'node.exe' -ArgumentList @('node_modules\vite\bin\vite.js','--host','127.0.0.1') -WorkingDirectory $projectRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $projectRoot 'preview.log') -RedirectStandardError (Join-Path $projectRoot 'preview-error.log') -PassThru
@{frontendPid=$webProcess.Id;backendPid=$apiProcess.Id;url='http://127.0.0.1:5173'} | ConvertTo-Json | Set-Content (Join-Path $projectRoot 'local-processes.json')
Write-Output 'Started local preview: http://127.0.0.1:5173 and Java API: http://127.0.0.1:8081'
