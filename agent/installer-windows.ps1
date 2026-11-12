# Installs (or reinstalls) the push agent as a Windows scheduled task: starts at logon, restarts if it dies.
# Windows counterpart of installer-launchd.sh. Needs agent\config.json (from config.example.json).
# `installer-windows.ps1 local`: this machine's own unfiltered office instead (agent\local.mjs, http://127.0.0.1:7320/),
# task connected-office.local. Both can run side by side.
# Logs: %LOCALAPPDATA%\connected-office\<name>.log.
# Remove: Unregister-ScheduledTask -TaskName connected-office -Confirm:$false
# Update: `git pull && git submodule update` from Git Bash (PowerShell's git uses Windows OpenSSH, without your SSH key),
# then Stop-ScheduledTask connected-office; Start-ScheduledTask connected-office (and the .local task).
# Usage (PowerShell, no admin): powershell -ExecutionPolicy Bypass -File agent\installer-windows.ps1 [local]
param([ValidateSet('push', 'local')][string]$Mode = 'push')
$ErrorActionPreference = 'Stop'

$Here = $PSScriptRoot
$Node = (Get-Command node -ErrorAction SilentlyContinue).Source
if (-not $Node) { throw 'node introuvable dans le PATH' }
if ($Mode -eq 'local') {
  $Name = 'connected-office.local'; $Script = 'local.mjs'; $Log = 'connected-office-local'
} else {
  if (-not (Test-Path (Join-Path $Here 'config.json'))) { throw 'agent\config.json absent (modele : config.example.json)' }
  $Name = 'connected-office'; $Script = 'push.mjs'; $Log = 'connected-office'
}

$LogDir = Join-Path $env:LOCALAPPDATA 'connected-office'
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
$LogFile = Join-Path $LogDir "$Log.log"

# node inside a hidden PowerShell: the task opens no console, its output goes to the log as UTF-8, and node's exit code
# becomes the task's, so a crash counts as a failure and the task is restarted
$Command = "& '$Node' '$(Join-Path $Here $Script)' 2>&1 | Out-File -FilePath '$LogFile' -Append -Encoding utf8; exit `$LASTEXITCODE"
$Action = New-ScheduledTaskAction -Execute 'powershell.exe' -WorkingDirectory $Here `
  -Argument "-NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -Command `"$Command`""
$Trigger = New-ScheduledTaskTrigger -AtLogOn -User "$env:USERDOMAIN\$env:USERNAME"
$Settings = New-ScheduledTaskSettingsSet -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) `
  -ExecutionTimeLimit ([TimeSpan]::Zero) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable `
  -MultipleInstances IgnoreNew
$Principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType Interactive -RunLevel Limited

if (Get-ScheduledTask -TaskName $Name -ErrorAction SilentlyContinue) {
  Stop-ScheduledTask -TaskName $Name -ErrorAction SilentlyContinue
  Unregister-ScheduledTask -TaskName $Name -Confirm:$false
}
Register-ScheduledTask -TaskName $Name -Action $Action -Trigger $Trigger -Settings $Settings -Principal $Principal | Out-Null
Start-ScheduledTask -TaskName $Name
Write-Output "installe : tache $Name, journal $LogFile"
