# Sync TV web build to Y:\anixapp-tv (= /opt/anixapp-tv)
# Usage:
#   yarn deploy:tv

param(
    [string]$Dest = "Y:\anixapp-tv"
)

$ErrorActionPreference = "Stop"
$SrcRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$Dist = Join-Path $SrcRoot "dist-tv-web"

if (-not (Test-Path "Y:\")) {
    Write-Error "Drive Y:\ not found. Mount SFTP to /opt first."
    exit 1
}

Write-Host "Building TV web (VITE_TV_MODE=1, base /)..."
Push-Location $SrcRoot
# Без yarn/cross-env: вызываем локальный vite из node_modules (работает и с npm, и с yarn).
$env:VITE_TV_MODE = "1"
$env:ANIXAPP_OUT_DIR = "dist-tv-web"
$env:ANIXAPP_WEB_BASE = "/"
& node (Join-Path $SrcRoot "node_modules\vite\bin\vite.js") build
$viteExit = $LASTEXITCODE
Remove-Item Env:VITE_TV_MODE, Env:ANIXAPP_OUT_DIR, Env:ANIXAPP_WEB_BASE -ErrorAction SilentlyContinue
if ($viteExit -ne 0) {
    Pop-Location
    Write-Error "vite build failed"
    exit $viteExit
}
Pop-Location

if (-not (Test-Path (Join-Path $Dist "index.html"))) {
    Write-Error "Build missing index.html in $Dist"
    exit 1
}

New-Item -ItemType Directory -Force -Path $Dest | Out-Null

Write-Host "Sync: $Dist"
Write-Host "  -> $Dest  (/opt/anixapp-tv on server)"

$prevNativePref = $false
if (Test-Path variable:PSNativeCommandUseErrorActionPreference) {
    $prevNativePref = $PSNativeCommandUseErrorActionPreference
    $PSNativeCommandUseErrorActionPreference = $false
}
try {
    & robocopy $Dist $Dest /MIR /XF nginx-tv.anixapp.com.conf /NFL /NDL /NJH /NJS /nc /ns /np | Out-Null
    $roboExit = $LASTEXITCODE
} finally {
    if (Test-Path variable:PSNativeCommandUseErrorActionPreference) {
        $PSNativeCommandUseErrorActionPreference = $prevNativePref
    }
}

if ($roboExit -ge 8) {
    Write-Error "robocopy failed (exit $roboExit)"
    exit $roboExit
}

Copy-Item -Force (Join-Path $SrcRoot "deploy\nginx-tv.anixapp.com.conf") (Join-Path $Dest "nginx-tv.anixapp.com.conf")
Copy-Item -Force (Join-Path $SrcRoot "deploy\anixapp-tv-bridge.service") (Join-Path $Dest "anixapp-tv-bridge.service")
Write-Host "robocopy ok (exit $roboExit)"

# Код бриджа на сервере (/opt/anixapp): вход по QR (пары ТВ↔телефон) и медиапрокси.
$serverRoot = Join-Path (Split-Path $Dest -Parent) "anixapp"
if (Test-Path $serverRoot) {
    $bridgeFiles = @(
        "vite\anix-web-bridge-plugin.mjs",
        "scripts\tv-bridge-server.mjs"
    )
    foreach ($rel in $bridgeFiles) {
        $src = Join-Path $SrcRoot $rel
        if (-not (Test-Path $src)) { continue }
        $dst = Join-Path $serverRoot $rel
        $dstDir = Split-Path $dst -Parent
        if (-not (Test-Path $dstDir)) { New-Item -ItemType Directory -Force -Path $dstDir | Out-Null }
        Copy-Item -Force $src $dst
        Write-Host "bridge: $rel"
    }
    Write-Host "Бридж на сервере: перезапустите его, чтобы подхватить код —"
    Write-Host "  systemctl restart anixapp-tv-bridge   (или перезапустите node scripts/tv-bridge-server.mjs)"
} else {
    Write-Host "bridge: каталог $serverRoot не найден — синк кода бриджа пропущен"
}
$global:LASTEXITCODE = 0
Write-Host ""
Write-Host "Done. Site files are on the server: /opt/anixapp-tv"
Write-Host "Open: https://tv.anixapp.com"
Write-Host ""
Write-Host "TV bridge (Kodik + media proxy) must run on the server:"
Write-Host "  cd /opt/anixapp && node scripts/tv-bridge-server.mjs"
Write-Host "  (or: systemctl enable --now anixapp-tv-bridge  after copying .service to /etc/systemd/system/)"
exit 0
