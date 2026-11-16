<#
.SYNOPSIS
    把本机的轻contacts 服务通过 SSH 反向隧道发布到公网（临时演示用）

.DESCRIPTION
    1. 检查本地 3000 端口服务，没启动就先启动；
    2. 建立 SSH 反向隧道（默认 localhost.run，可选 serveo.net）；
    3. 解析公网地址并打印，同时写入 .public-url.txt。

    注意：隧道依赖本机开机联网，免费域名每次重连都会变化；
    正式交作业请参考 docs/DEPLOY.md 部署到云服务器。

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File tools/start-online.ps1

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File tools/start-online.ps1 -Provider serveo
#>
[CmdletBinding()]
param(
    [int]$Port = 3000,
    [ValidateSet('lhr', 'serveo')]
    [string]$Provider = 'lhr'
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

$sshPath = 'C:\WINDOWS\System32\OpenSSH\ssh.exe'
if (-not (Test-Path $sshPath)) { $sshPath = 'ssh.exe' }

function Test-App {
    try {
        return (Invoke-WebRequest -Uri "http://127.0.0.1:$Port/api/health" -UseBasicParsing -TimeoutSec 3).StatusCode -eq 200
    } catch {
        return $false
    }
}

# 0. 结束上一次由本脚本启动的隧道，避免端口/进程残留
$pidFile = Join-Path $root '.tunnel.pid'
if (Test-Path $pidFile) {
    $oldPid = (Get-Content $pidFile -ErrorAction SilentlyContinue | Select-Object -First 1)
    if ($oldPid -and (Get-Process -Id $oldPid -ErrorAction SilentlyContinue)) {
        Write-Host "结束上一次的隧道进程 $oldPid"
        Stop-Process -Id $oldPid -Force -ErrorAction SilentlyContinue
        Start-Sleep -Seconds 1
    }
}

# 1. 本地服务
if (-not (Test-App)) {
    Write-Host "本地服务未启动，正在启动 node server.js ..."
    $serverLog = Join-Path $root '.server.log'
    Start-Process -FilePath 'node' -ArgumentList 'server.js' -WorkingDirectory $root -WindowStyle Hidden `
        -RedirectStandardOutput $serverLog -RedirectStandardError "$serverLog.err" | Out-Null

    $deadline = (Get-Date).AddSeconds(20)
    while ((Get-Date) -lt $deadline -and -not (Test-App)) { Start-Sleep -Milliseconds 400 }
    if (-not (Test-App)) { throw '本地服务启动失败，请先手动运行 node server.js 排查。' }
    Write-Host "本地服务已就绪： http://127.0.0.1:$Port"
}
else {
    Write-Host "本地服务已在运行： http://127.0.0.1:$Port"
}

# 2. 建立隧道
$log = Join-Path $root '.tunnel.log'
$errLog = Join-Path $root '.tunnel.err'
Remove-Item $log, $errLog -ErrorAction SilentlyContinue

$remote = if ($Provider -eq 'lhr') { 'nokey@localhost.run' } else { 'serveo.net' }
$sshArgs = @(
    '-o', 'StrictHostKeyChecking=no',
    '-o', 'UserKnownHostsFile=NUL',
    '-o', 'ServerAliveInterval=30',
    '-o', 'ServerAliveCountMax=3',
    '-o', 'ExitOnForwardFailure=yes',
    '-R', "80:localhost:$Port",
    $remote
)

Write-Host "正在建立隧道（$Provider）..."
$tunnel = Start-Process -FilePath $sshPath -ArgumentList $sshArgs -WindowStyle Hidden `
    -RedirectStandardOutput $log -RedirectStandardError $errLog -PassThru

$tunnel.Id | Out-File -FilePath $pidFile -Encoding ascii

# 3. 解析公网地址
$pattern = if ($Provider -eq 'lhr') { 'https://[a-z0-9]+\.app\.lhr\.life' } else { 'https://[a-z0-9-]+\.serveousercontent\.com' }
$publicUrl = $null
$deadline = (Get-Date).AddSeconds(30)
while ((Get-Date) -lt $deadline -and -not $publicUrl) {
    Start-Sleep -Milliseconds 500
    if ($tunnel.HasExited) {
        $detail = (Get-Content $errLog -Raw -ErrorAction SilentlyContinue) -replace "`e\[[0-9;]*m", ''
        throw "隧道进程提前退出：$detail"
    }
    $raw = ((Get-Content $log -Raw -ErrorAction SilentlyContinue) + (Get-Content $errLog -Raw -ErrorAction SilentlyContinue)) -replace "`e\[[0-9;]*m", ''
    $match = [regex]::Match($raw, $pattern)
    if ($match.Success) { $publicUrl = $match.Value }
}

if (-not $publicUrl) { throw '没有从隧道日志里解析到公网地址，请查看 .tunnel.log。' }

$publicUrl | Out-File -FilePath (Join-Path $root '.public-url.txt') -Encoding utf8

Write-Host ''
Write-Host '==============================================' -ForegroundColor Green
Write-Host " 公网地址： $publicUrl" -ForegroundColor Green
Write-Host '==============================================' -ForegroundColor Green
Write-Host ''
Write-Host '说明：'
Write-Host '  - 该地址依赖本机开机联网，关机 / 睡眠后失效；'
Write-Host '  - 免费隧道域名每次重连都会变化，博客里的链接要同步更新；'
Write-Host '  - 正式作业建议按 docs/DEPLOY.md 部署到云服务器。'
Write-Host ''
Write-Host "停止隧道： powershell -ExecutionPolicy Bypass -File tools/stop-online.ps1"
