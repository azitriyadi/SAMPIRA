[CmdletBinding()]
param(
    [string]$MySqlBin = 'C:\xampp\mysql\bin',
    [string]$Chrome = 'C:\Program Files\Google\Chrome\Application\chrome.exe',
    [string]$Screenshots,
    [switch]$SkipBrowser,
    [switch]$Phase8BrowserOnly,
    [switch]$AuthBrowserOnly,
    [switch]$PortalDesignOnly,
    [switch]$Phase9BrowserOnly,
    [switch]$Phase9Finalization,
    [switch]$HandlingPhotoOnly,
    [switch]$Integration10,
    [switch]$RewardPaymentOnly,
    [switch]$Security10BOnly,
    [switch]$Final10C,
    [switch]$EducationContentOnly,
    [switch]$UserReferenceOnly,
    [switch]$UserReferenceRegression,
    [ValidateRange(1024,65535)][int]$DatabasePort = 24367,
    [ValidateRange(1024,65535)][int]$ServerPort = 24934
)
$ErrorActionPreference = 'Stop'
Set-Location (Join-Path $PSScriptRoot '..')
if ((git branch --show-current) -ne 'main') { throw 'Run this fixture from the integrated main working tree.' }
if (!$SkipBrowser -and !(Test-Path -LiteralPath $Chrome)) { throw 'Pass the installed Chrome executable with -Chrome.' }
if ($Screenshots) { $env:SAMPIRA_TEST_PHASE6_SCREENSHOTS = [IO.Path]::GetFullPath($Screenshots) }
$previousTemp=$env:TEMP
$previousTmp=$env:TMP
if(([IO.DriveInfo]::new([IO.Path]::GetPathRoot($previousTemp))).AvailableFreeSpace -lt 2GB){throw 'Fixture requires at least 2 GiB free. Clean unused test artifacts before retrying.'}
$t=[IO.Path]::GetFullPath((Join-Path $previousTemp ('sampira-6b-fe-'+[guid]::NewGuid().ToString('N'))))
New-Item -ItemType Directory $t | Out-Null
Set-Content -LiteralPath (Join-Path $t '.sampira-test-fixture') -Value 'Disposable isolated SAMPIRA test run'
$db=$null
try {
# All child HTTP copies, Chrome profiles and Go temporary files belong to this run.
$env:TEMP=$t
$env:TMP=$t
foreach($fixturePort in $DatabasePort,$ServerPort) {
 $occupied=@(netstat -ano | Select-String ":$fixturePort\s+.*LISTENING")
 if($occupied.Count){throw "Fixture port occupied: $fixturePort ($occupied)"}
}
$env:SAMPIRA_TEST_BIN="$t/server.exe"
$env:SAMPIRA_TEST_INIT="$t/init.exe"
$env:SAMPIRA_TEST_MYSQL=Join-Path $MySqlBin 'mysql.exe'
if ($SkipBrowser) { Remove-Item Env:SAMPIRA_TEST_CHROME -ErrorAction SilentlyContinue }
else { $env:SAMPIRA_TEST_CHROME=$Chrome }
$env:SAMPIRA_TEST_FE_SOURCE=(Get-Location).Path
if($EducationContentOnly){$env:SAMPIRA_TEST_EDUCATION_CONTENT='1'}
else{Remove-Item Env:SAMPIRA_TEST_EDUCATION_CONTENT -ErrorAction SilentlyContinue}
if($UserReferenceOnly){$env:SAMPIRA_TEST_USER_REFERENCE='1'}
else{Remove-Item Env:SAMPIRA_TEST_USER_REFERENCE -ErrorAction SilentlyContinue}
if($UserReferenceRegression){$env:SAMPIRA_TEST_USER_REFERENCE_FULL='1'}
else{Remove-Item Env:SAMPIRA_TEST_USER_REFERENCE_FULL -ErrorAction SilentlyContinue}
if($Final10C){$env:SAMPIRA_TEST_FINAL10C='1'}
else{Remove-Item Env:SAMPIRA_TEST_FINAL10C -ErrorAction SilentlyContinue}
if($Security10BOnly){$env:SAMPIRA_TEST_SECURITY10B='1'}
else{Remove-Item Env:SAMPIRA_TEST_SECURITY10B -ErrorAction SilentlyContinue}
if($RewardPaymentOnly){$env:SAMPIRA_TEST_REWARD_PAYMENT='1'}
else{Remove-Item Env:SAMPIRA_TEST_REWARD_PAYMENT -ErrorAction SilentlyContinue}
if($Integration10){$env:SAMPIRA_TEST_INTEGRATION10='1'}
else{Remove-Item Env:SAMPIRA_TEST_INTEGRATION10 -ErrorAction SilentlyContinue}
if($HandlingPhotoOnly){$env:SAMPIRA_TEST_HANDLING_PHOTO='1'}
else{Remove-Item Env:SAMPIRA_TEST_HANDLING_PHOTO -ErrorAction SilentlyContinue}
if($Phase9Finalization){$env:SAMPIRA_TEST_PHASE9_FINAL='1'}
else{Remove-Item Env:SAMPIRA_TEST_PHASE9_FINAL -ErrorAction SilentlyContinue}
if($Phase9BrowserOnly){$env:SAMPIRA_TEST_PHASE9_ONLY='1'}
else{Remove-Item Env:SAMPIRA_TEST_PHASE9_ONLY -ErrorAction SilentlyContinue}
if($PortalDesignOnly){$env:SAMPIRA_TEST_PORTAL_DESIGN_ONLY='1'}
else{Remove-Item Env:SAMPIRA_TEST_PORTAL_DESIGN_ONLY -ErrorAction SilentlyContinue}
if($AuthBrowserOnly){$env:SAMPIRA_TEST_AUTH_ONLY='1'}
else{Remove-Item Env:SAMPIRA_TEST_AUTH_ONLY -ErrorAction SilentlyContinue}
if($Phase8BrowserOnly){$env:SAMPIRA_TEST_PHASE8_ONLY='1'}
else{Remove-Item Env:SAMPIRA_TEST_PHASE8_ONLY -ErrorAction SilentlyContinue}
$env:SAMPIRA_TEST_PHASE3_FE='1'
$env:SAMPIRA_TEST_PHASE4_FE='1'
$env:SAMPIRA_TEST_PHASE5_FE='1'
$env:SAMPIRA_TEST_PHASE6_FE='1'
foreach($phase in 3,4,5,6){
 # Legacy API suites populate shared Admin queues. Their full run is separate
 # from browser fixtures that intentionally assert exact queue counts.
 if($SkipBrowser){Set-Item "Env:SAMPIRA_TEST_PHASE$phase" '1'}
 else{Remove-Item "Env:SAMPIRA_TEST_PHASE$phase" -ErrorAction SilentlyContinue}
}
if($SkipBrowser){Remove-Item Env:SAMPIRA_TEST_PHASE6_BROWSER_PREP -ErrorAction SilentlyContinue}
else{$env:SAMPIRA_TEST_PHASE6_BROWSER_PREP='1'}
$env:SAMPIRA_TEST_PHASE7='1'
$env:SAMPIRA_TEST_PHASE9='1'
if($RewardPaymentOnly -or $Security10BOnly -or $EducationContentOnly -or $UserReferenceOnly){
 foreach($phase in 3,4,5,6,7,9){Remove-Item "Env:SAMPIRA_TEST_PHASE$phase" -ErrorAction SilentlyContinue}
 Remove-Item Env:SAMPIRA_TEST_PHASE6_BROWSER_PREP -ErrorAction SilentlyContinue
}
if($UserReferenceOnly -and $UserReferenceRegression){$env:SAMPIRA_TEST_PHASE9='1'}

 go build -buildvcs=false -o $env:SAMPIRA_TEST_BIN ./cmd/server
 if($LASTEXITCODE){throw 'Server build failed'}
 go build -buildvcs=false -o $env:SAMPIRA_TEST_INIT ./db_init
 if($LASTEXITCODE){throw 'Initializer build failed'}

& (Join-Path $MySqlBin 'mysql_install_db.exe') "--datadir=$t/data" --port=$DatabasePort --silent
if($LASTEXITCODE){throw 'Fixture initialization failed'}
$dbArguments=@('--no-defaults','--bind-address=127.0.0.1',"--port=$DatabasePort",('--datadir="'+$t+'/data"'),'--console')
if($HandlingPhotoOnly -or $RewardPaymentOnly -or $Integration10 -or $Security10BOnly){$dbArguments+='--max-allowed-packet=1048576'}
if($Security10BOnly -or $Integration10){$dbArguments+='--default-time-zone=+07:00'}
$db=Start-Process (Join-Path $MySqlBin 'mysqld.exe') -ArgumentList $dbArguments -WindowStyle Hidden -PassThru -RedirectStandardOutput "$t/db.out" -RedirectStandardError "$t/db.err"
 for($i=0;$i -lt 40;$i++){
  if($db.HasExited){Get-Content "$t/db.err";throw 'MariaDB exited'}
  if(netstat -ano | Select-String (":"+$DatabasePort+"\s+.*LISTENING\s+"+$db.Id+"$")){break}
  Start-Sleep -Milliseconds 250
 }
 New-Item -ItemType Directory "$t/scripts" | Out-Null
 $scripts=@('check-phase1-migration.mjs','check-api-regressions.mjs','check-phase1-browser.mjs','check-phase3-frontend.mjs','check-phase4-frontend.mjs','check-phase5-frontend.mjs','check-phase6-frontend.mjs','check-landing-frontend.mjs','check-auth-frontend.mjs','check-phase3-reports.mjs','check-phase4-handling.mjs','check-phase5-locations.mjs','check-phase6-education.mjs','check-phase7.mjs','check-user-frontend.mjs','admin-visual-fixture.mjs','check-phase8-frontend.mjs','check-portal-design.mjs')
 $scripts += 'check-phase9.mjs'
 $scripts += 'check-phase9-frontend.mjs'
 $scripts += 'check-phase10-integration.mjs'
 $scripts += 'check-reward-payment.mjs'
 $scripts += 'check-phase10b-security.mjs'
 $scripts += 'check-phase10c-final.mjs'
 $scripts += 'check-education-content.mjs','import-education-content.mjs'
 $scripts += 'check-user-reference.mjs'
 $scripts += 'check-user-form-steps.mjs'
 $scripts += 'check-collector-tasks.mjs'
 $scripts += 'check-admin-refresh.mjs'
 $scripts += 'check-administrator-refresh.mjs'
 $scripts += 'check-education-cms-photos.mjs','check-facility-community.mjs','check-home-location.mjs','check-city-datasets.mjs','check-education-layout.mjs'
 foreach($file in $scripts){
  $source = "scripts/$file"
  $content=(Get-Content -Raw -Encoding utf8 $source).Replace('13316', [string]$DatabasePort).Replace('18081', [string]$ServerPort)
  if($file -eq 'check-phase1-migration.mjs'){
   $content=$content.Replace('cpSync(directory, join(cwd, directory)','cpSync(resolve(process.env.SAMPIRA_TEST_FE_SOURCE, directory), join(cwd, directory)')
   $content="import {fileURLToPath} from 'node:url';"+[Environment]::NewLine+$content
   foreach($child in $scripts){$content=$content.Replace("resolve('scripts/$child')","fileURLToPath(new URL('./$child', import.meta.url))")}
  }
  Set-Content -Encoding utf8 -LiteralPath "$t/scripts/$file" -Value $content
 }
 New-Item -ItemType Directory "$t/db_init/migrations" -Force | Out-Null
 Copy-Item "db_init/migrations/*.sql" "$t/db_init/migrations"
 if($EducationContentOnly){
  New-Item -ItemType Directory "$t/docs/content" -Force | Out-Null
  Copy-Item 'docs/content/SAMPIRA_KONTEN_EDUKASI_TERVERIFIKASI.md' "$t/docs/content/"
 }
 node "$t/scripts/check-phase1-migration.mjs"
 if($LASTEXITCODE){throw 'Fixture failed'}
} finally {
 try {
  if($db -and !$db.HasExited){& (Join-Path $MySqlBin 'mysqladmin.exe') --no-defaults --protocol=tcp -h 127.0.0.1 -P $DatabasePort -u root shutdown; if(!$db.WaitForExit(5000)){Stop-Process -Id $db.Id; $null=$db.WaitForExit(5000)}}
 } finally {
  $env:TEMP=$previousTemp
  $env:TMP=$previousTmp
  $safeParent=[IO.Path]::GetFullPath($previousTemp).TrimEnd('\')
  if([IO.Path]::GetDirectoryName($t) -ne $safeParent -or [IO.Path]::GetFileName($t) -notmatch '^sampira-6b-fe-[a-f0-9]{32}$' -or !(Test-Path -LiteralPath (Join-Path $t '.sampira-test-fixture'))){throw 'Unsafe fixture cleanup target.'}
  if($db -and !$db.HasExited){Write-Warning "Fixture process still active; kept $t"}
  else {
   for($attempt=0;$attempt -lt 4;$attempt++){
    try {Remove-Item -LiteralPath $t -Recurse -Force -ErrorAction Stop;break}
    catch {if($attempt -eq 3){Write-Warning "Fixture cleanup incomplete: $t"}else{Start-Sleep -Milliseconds 400}}
   }
   if(!(Test-Path -LiteralPath $t)){Write-Output 'Fixture and nested browser/build artifacts removed.'}
  }
 }
}
