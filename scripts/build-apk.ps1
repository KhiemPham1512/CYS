# Build the release APK (arm64) and sign it with your own key. Run from the repo root in PowerShell:
#   .\scripts\build-apk.ps1
# The keystore and its password file live OUTSIDE the repo (never commit them).
# Output: .local-artifacts\release\cys-<version>.apk
param(
  [string]$Keystore = 'D:\Keys\cys-release.jks',
  [string]$PasswordFile = 'D:\Keys\cys-release.txt',
  [string]$Alias = 'cys',
  [string]$StudioJbr = 'D:\Android\Android Studio\jbr',
  [string]$BuildTools = 'D:\Android\Sdk\build-tools\37.0.0'
)
$ErrorActionPreference = 'Continue' # native tools write progress to stderr; failures are caught by exit codes below
$repo = Split-Path -Parent $PSScriptRoot
Set-Location $repo

foreach ($p in @($Keystore, $PasswordFile, $StudioJbr, $BuildTools)) {
  if (-not (Test-Path $p)) { throw "Missing: $p" }
}
if (-not (Test-Path '.env')) { throw 'Missing .env (copy .env.example and fill EXPO_PUBLIC_*)' }

# Keep every temp/cache file on drive D (project rule: nothing on drive C).
$env:npm_config_cache = 'D:\Cache\npm-cache'
$env:TEMP = 'D:\Cache\tmp'
$env:TMP = 'D:\Cache\tmp'
$env:JAVA_HOME = $StudioJbr
$env:ANDROID_HOME = 'D:\Android\Sdk'
$env:Path = "$StudioJbr\bin;D:\CNPM\NodeJS;$env:Path"

$version = (Get-Content app.json -Raw | ConvertFrom-Json).expo.version

Push-Location android
try {
  .\gradlew.bat assembleRelease '-PreactNativeArchitectures=arm64-v8a'
  if ($LASTEXITCODE -ne 0) { throw 'gradle failed' }
} finally { Pop-Location }

$built = 'android\app\build\outputs\apk\release\app-release.apk'
if (-not (Test-Path $built)) { throw "APK not found: $built" }

New-Item -ItemType Directory -Force '.local-artifacts\release' | Out-Null
$out = ".local-artifacts\release\cys-$version.apk"
# apksigner đọc một file mật khẩu chỉ được một lần, nên đưa mật khẩu qua biến môi trường (không in ra màn hình).
$env:CYS_KS_PASS = (Get-Content $PasswordFile -Raw).Trim()
& "$BuildTools\apksigner.bat" sign --ks $Keystore --ks-key-alias $Alias `
  --ks-pass 'env:CYS_KS_PASS' --key-pass 'env:CYS_KS_PASS' --out $out $built
Remove-Item Env:CYS_KS_PASS -ErrorAction SilentlyContinue
if ($LASTEXITCODE -ne 0) { throw 'apksigner failed' }
& "$BuildTools\apksigner.bat" verify --print-certs $out | Select-Object -First 3
"OK: $out"
