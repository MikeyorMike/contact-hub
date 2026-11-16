<#
.SYNOPSIS
    一键抓取「轻contacts」演示截图（Windows + Microsoft Edge）

.DESCRIPTION
    启动本地服务（如果还没启动），用 Edge 无头模式按预设状态逐张截图，
    输出到 docs/screenshots/。截图状态通过页面深链接控制，无需人工点击。

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File tools/capture-screenshots.ps1

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File tools/capture-screenshots.ps1 -BaseUrl http://127.0.0.1:8080
#>
[CmdletBinding()]
param(
    [string]$BaseUrl = 'http://127.0.0.1:3000',
    [string]$EdgePath = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe',
    [int]$Width = 1440,
    [int]$Height = 940,
    [switch]$KeepServer
)

$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$outDir = Join-Path $root 'docs\screenshots'
New-Item -ItemType Directory -Force -Path $outDir | Out-Null

if (-not (Test-Path $EdgePath)) {
    $candidates = @(
        'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe',
        'C:\Program Files\Microsoft\Edge\Application\msedge.exe'
    )
    $EdgePath = $candidates | Where-Object { Test-Path $_ } | Select-Object -First 1
    if (-not $EdgePath) { throw '没有找到 Microsoft Edge，请手动修改 -EdgePath 参数。' }
}

function Test-Server {
    try {
        $response = Invoke-WebRequest -Uri "$BaseUrl/api/health" -UseBasicParsing -TimeoutSec 3
        return $response.StatusCode -eq 200
    } catch {
        return $false
    }
}

$startedServer = $false
$serverProcess = $null

if (-not (Test-Server)) {
    Write-Host "服务未启动，正在启动 node server.js ..."
    $serverProcess = Start-Process -FilePath 'node' -ArgumentList 'server.js' -WorkingDirectory $root -WindowStyle Hidden -PassThru
    $startedServer = $true

    $deadline = (Get-Date).AddSeconds(20)
    while ((Get-Date) -lt $deadline -and -not (Test-Server)) {
        Start-Sleep -Milliseconds 400
    }
    if (-not (Test-Server)) { throw "服务启动失败，请手动运行 node server.js 后重试。" }
}

$states = @(
    @{ File = '01-home.png';           Url = "$BaseUrl/?theme=light";              Desc = '首页 · 三栏工作台' },
    @{ File = '02-starred.png';        Url = "$BaseUrl/?theme=light&view=starred"; Desc = '收藏夹视图' },
    @{ File = '03-detail.png';         Url = "$BaseUrl/?theme=light&contact=2";    Desc = '联系人详情 · 多联系方式' },
    @{ File = '04-new-contact.png';    Url = "$BaseUrl/?theme=light&open=new";     Desc = '新建联系人弹窗' },
    @{ File = '05-import.png';         Url = "$BaseUrl/?theme=light&open=import";  Desc = '导入 Excel 弹窗' },
    @{ File = '06-dark.png';           Url = "$BaseUrl/?theme=dark&view=starred";  Desc = '深色模式' },
    @{ File = '07-mobile.png';         Url = "$BaseUrl/?theme=light";              Desc = '移动端列表' },
    @{ File = '10-mobile-detail.png';  Url = "$BaseUrl/?theme=light&contact=2";    Desc = '移动端详情抽屉' }
)

$failures = @()

foreach ($state in $states) {
    $target = Join-Path $outDir $state.File
    Remove-Item $target -ErrorAction SilentlyContinue

    $isMobile = $state.File -like '*mobile*'
    $size = if ($isMobile) { '430,932' } else { "$Width,$Height" }
    $profile = Join-Path $env:TEMP ('ch-shot-' + [guid]::NewGuid().ToString('N'))

    Write-Host ("截图 {0} -> {1}" -f $state.Desc, $state.File)
    $arguments = @(
        '--headless=new',
        '--disable-gpu',
        '--hide-scrollbars',
        '--no-first-run',
        "--window-size=$size",
        '--virtual-time-budget=5000',
        "--user-data-dir=$profile",
        "--screenshot=$target",
        $state.Url
    )

    try {
        Start-Process -FilePath $EdgePath -ArgumentList $arguments -Wait -WindowStyle Hidden
    } catch {
        Write-Warning "Edge 启动失败：$($_.Exception.Message)"
    }

    if (-not (Test-Path $target)) { $failures += $state.File }
    Remove-Item $profile -Recurse -Force -ErrorAction SilentlyContinue
}

if ($startedServer -and -not $KeepServer) {
    if ($serverProcess -and -not $serverProcess.HasExited) {
        Stop-Process -Id $serverProcess.Id -Force -ErrorAction SilentlyContinue
    }
}

Write-Host ''
Get-ChildItem $outDir -Filter *.png | Select-Object Name, @{ Name = 'KB'; Expression = { [math]::Round($_.Length / 1KB) } } | Format-Table -AutoSize

if ($failures.Count -gt 0) {
    Write-Warning ("以下截图未生成：{0}" -f ($failures -join ', '))
    Write-Host '可以手动打开页面截图，或检查 Edge 是否允许无头模式运行。'
    exit 1
}

Write-Host '全部截图已生成到 docs/screenshots/，可直接上传到 CSDN 图床。'
