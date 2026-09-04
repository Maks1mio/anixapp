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
yarn cross-env VITE_TV_MODE=1 ANIXAPP_OUT_DIR=dist-tv-web ANIXAPP_WEB_BASE=/ vite build
if ($LASTEXITCODE -ne 0) {
    Pop-Location
    Write-Error "vite build failed"
    exit $LASTEXITCODE
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
$global:LASTEXITCODE = 0
Write-Host ""
Write-Host "Done. Site files are on the server: /opt/anixapp-tv"
Write-Host "Open: https://tv.anixapp.com"
Write-Host ""
Write-Host "TV bridge (Kodik + media proxy) must run on the server:"
Write-Host "  cd /opt/anixapp && node scripts/tv-bridge-server.mjs"
Write-Host "  (or: systemctl enable --now anixapp-tv-bridge  after copying .service to /etc/systemd/system/)"
exit 0
