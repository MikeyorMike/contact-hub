<#
.SYNOPSIS
    停止由 start-online.ps1 启动的 SSH 隧道
#>
$root = Split-Path -Parent $PSScriptRoot
$pidFile = Join-Path $root '.tunnel.pid'

if (-not (Test-Path $pidFile)) {
    Write-Host '没有找到隧道进程记录，可能已经停止。'
    return
}

$tunnelPid = (Get-Content $pidFile | Select-Object -First 1)
if ($tunnelPid -and (Get-Process -Id $tunnelPid -ErrorAction SilentlyContinue)) {
    Stop-Process -Id $tunnelPid -Force
    Write-Host "已停止隧道进程 $tunnelPid"
} else {
    Write-Host '隧道进程已不存在。'
}
Remove-Item $pidFile -ErrorAction SilentlyContinue
Remove-Item (Join-Path $root '.public-url.txt') -ErrorAction SilentlyContinue
