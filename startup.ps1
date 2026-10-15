$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
try {
  $response = Invoke-WebRequest -Uri 'http://127.0.0.1:8080/' -TimeoutSec 3 -UseBasicParsing
  if ($response.StatusCode -eq 200) { exit 0 }
} catch { }
Start-Process -FilePath 'cmd.exe' -ArgumentList '/c', 'npm run dev' -WorkingDirectory $PSScriptRoot -WindowStyle Hidden -RedirectStandardOutput "$PSScriptRoot/screenshots/dev.log" -RedirectStandardError "$PSScriptRoot/screenshots/dev-error.log"
