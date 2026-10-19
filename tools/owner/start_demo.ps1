# start_demo.ps1 -- the owner's demo: the demo database, the API server, the emulator with the
# phone app, and the desktop program. Double-click tools\owner\start_demo.cmd, which runs this file.
# stop_demo.cmd stops exactly what this file started, read from the PID file this file writes.
#
# THIS FILE IS SAVED WITH A UTF-8 BOM because it holds Thai text: PowerShell 5.1 reads a BOM-less
# .ps1 as CP874 (CLAUDE.md, Machine footguns). Keep the BOM if you edit it.
#
# -FloorGB: the free memory below which it refuses to start (6 GB: the emulator ~3 GB, Metro ~1 GB,
# the desktop program and the server ~1 GB, and some room left for Windows).
param([double]$FloorGB = 6.0)

# "Continue", not "Stop": under Stop, PowerShell 5.1 turns a native program's stderr line (docker, adb,
# python) into a terminating error. Every step below checks its own result instead.
$ErrorActionPreference = "Continue"
try { [Console]::OutputEncoding = New-Object System.Text.UTF8Encoding $false } catch { }

# ---- 1. THE GATE'S LOCK, FIRST: nothing is read, checked or started before this. -----------------
$Lock = Join-Path $env:TEMP "recycle_prove_all.lock"
if (Test-Path -LiteralPath $Lock) {
    $holder = ""
    try { $holder = (Get-Content -LiteralPath $Lock -Raw).Trim() } catch { }
    Write-Host "START_DEMO_REFUSED: the prove_all gate holds its lock ($Lock; holder: $holder)."
    Write-Host "ตอนนี้มีการตรวจระบบอัตโนมัติ (prove_all) กำลังทำงานอยู่ จึงยังเปิดระบบสาธิตไม่ได้"
    Write-Host "รอให้การตรวจระบบเสร็จก่อน แล้วค่อยดับเบิลคลิก start_demo อีกครั้ง"
    Write-Host "START_DEMO_EXIT=3"
    exit 3
}

$Root = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$State = Join-Path $env:LOCALAPPDATA "recycle-demo"
$PidFile = Join-Path $State "pids.json"
$Py = Join-Path $Root "server\.venv\Scripts\python.exe"
$Sdk = "E:\android\sdk"
$Adb = Join-Path $Sdk "platform-tools\adb.exe"
$Emu = Join-Path $Sdk "emulator\emulator.exe"
$Avd = "recycle_api36"
$AppId = "dev.chutipon.recycle"
$Utf8 = New-Object System.Text.UTF8Encoding $false
New-Item -ItemType Directory -Force -Path $State | Out-Null

function Say([string]$s) { Write-Host $s }
function Refuse([int]$code, [string[]]$lines) {
    foreach ($l in $lines) { Write-Host $l }
    Write-Host "START_DEMO_EXIT=$code"
    exit $code
}

# The PID file: every process this file starts is recorded the moment it starts, so stop_demo can
# stop a half-finished start too. A PID is matched with its start time, so a PID Windows has since
# handed to another program is never stopped.
$Started = New-Object System.Collections.ArrayList
$Flags = @{}
function Save-State {
    $o = [pscustomobject]@{ started = @($Started); flags = $Flags; root = $Root }
    [System.IO.File]::WriteAllText($PidFile, ($o | ConvertTo-Json -Depth 5), $Utf8)
}
function Record([string]$name, $proc) {
    $entry = [pscustomobject]@{ name = $name; pid = $proc.Id; start = $proc.StartTime.ToUniversalTime().ToString("o") }
    [void]$Started.Add($entry)
    Save-State
    Say ("  started {0,-16} pid={1}" -f $name, $proc.Id)
}

# ---- 2. ALREADY RUNNING? ---------------------------------------------------------------------------
if (Test-Path -LiteralPath $PidFile) {
    $prev = Get-Content -LiteralPath $PidFile -Raw -Encoding UTF8 | ConvertFrom-Json
    $alive = @($prev.started | Where-Object {
        $p = Get-Process -Id $_.pid -ErrorAction SilentlyContinue
        $p -and $p.StartTime.ToUniversalTime().ToString("o") -eq $_.start })
    if ($alive.Count -gt 0) {
        Refuse 5 @("START_DEMO_REFUSED: a demo started earlier is still running ($($alive.Count) of its processes are alive; $PidFile).",
                   "ระบบสาธิตเปิดอยู่แล้ว ถ้าจะเปิดใหม่ ให้ดับเบิลคลิก stop_demo ก่อน")
    }
    Remove-Item -LiteralPath $PidFile
    Say "  (an old PID file named no live process; removed)"
}

# ---- 3. FREE MEMORY ---------------------------------------------------------------------------------
$freeGB = [math]::Round((Get-CimInstance Win32_OperatingSystem).FreePhysicalMemory / 1MB, 2)
Say "free memory: $freeGB GB (floor $FloorGB GB)"
if ($freeGB -lt $FloorGB) {
    $top = Get-Process | Group-Object ProcessName | ForEach-Object {
        [pscustomobject]@{ Name = $_.Name; GB = [math]::Round(($_.Group | Measure-Object WorkingSet64 -Sum).Sum / 1GB, 2) } } |
        Sort-Object GB -Descending | Select-Object -First 8
    $lines = @("START_DEMO_REFUSED: $freeGB GB free is below the floor of $FloorGB GB.",
               "หน่วยความจำว่างเหลือ $freeGB GB น้อยกว่าที่ระบบสาธิตต้องใช้ ($FloorGB GB)",
               "ปิดโปรแกรมที่ไม่ได้ใช้ในรายการนี้บางตัว แล้วดับเบิลคลิก start_demo อีกครั้ง:")
    foreach ($t in $top) { $lines += ("    {0,-28} {1,6} GB" -f $t.Name, $t.GB) }
    Refuse 4 $lines
}

# ---- 4. THE ADDRESS BAKED INTO THE PHONE APP --------------------------------------------------------
$appJson = [System.IO.File]::ReadAllText((Join-Path $Root "mobile\app.json"), $Utf8) | ConvertFrom-Json
$baked = [string]$appJson.expo.extra.apiBaseUrl
$bakedHost = ([System.Uri]$baked).Host
$mine = @(Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
    Where-Object { $_.IPAddress -ne "127.0.0.1" -and $_.IPAddress -notlike "169.254.*" } |
    Select-Object -ExpandProperty IPAddress)
Say "the phone app calls $baked; this machine's IPv4 now: $($mine -join ', ')"
if ($mine -notcontains $bakedHost) {
    $Flags["ip_mismatch"] = $true
    Say "WARNING: no IPv4 on this machine is $bakedHost."
    Say "ที่อยู่ IP ของเครื่องนี้ตอนนี้คือ $($mine -join ', ') แต่แอปในโทรศัพท์ถูกตั้งไว้ให้เรียก $bakedHost"
    Say "แอปในโทรศัพท์จะขึ้นว่า ออฟไลน์ ส่วนโปรแกรมบนคอมพิวเตอร์ยังใช้ได้ตามปกติ"
    Say "วิธีแก้: ให้เครื่องนี้ได้ IP $bakedHost เสมอ (จองที่อยู่นี้ให้เครื่องนี้ในเราเตอร์ หรือตั้ง IP แบบคงที่ใน Windows)"
    Say "แล้วดับเบิลคลิก stop_demo และ start_demo ใหม่"
}

# ---- 5. PORTS 8000 (server) AND 8081 (Metro) MUST BE FREE: another program's listener is never stopped.
foreach ($port in 8000, 8081) {
    $l = Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($l) {
        $who = Get-Process -Id $l.OwningProcess -ErrorAction SilentlyContinue
        Refuse 6 @("START_DEMO_REFUSED: port $port is already in use by $($who.ProcessName) (pid $($l.OwningProcess)).",
                   "พอร์ต $port มีโปรแกรมอื่นใช้อยู่ ($($who.ProcessName), PID $($l.OwningProcess)) ระบบสาธิตจะไม่ปิดโปรแกรมที่มันไม่ได้เปิดเอง",
                   "ปิดโปรแกรมนั้นก่อน แล้วดับเบิลคลิก start_demo อีกครั้ง")
    }
}
Save-State

# ---- 6. DOCKER AND recycle_pg -----------------------------------------------------------------------
docker info *> $null
if ($LASTEXITCODE -ne 0) {
    Say "Docker is not running: starting Docker Desktop (stop_demo leaves it running)"
    Start-Process "C:\Program Files\Docker\Docker\Docker Desktop.exe"
    $Flags["docker_desktop_started"] = $true
    $t = 0
    do { Start-Sleep -Seconds 5; $t += 5; docker info *> $null } until ($LASTEXITCODE -eq 0 -or $t -ge 240)
    if ($LASTEXITCODE -ne 0) { Refuse 7 @("START_DEMO_FAILED: Docker did not come up in 240 s.", "Docker ไม่ยอมเปิด ลองเปิด Docker Desktop เองแล้วดับเบิลคลิก start_demo อีกครั้ง") }
}
$running = (docker inspect -f "{{.State.Running}}" recycle_pg 2> $null)
if ($running -ne "true") {
    Say "recycle_pg is stopped: starting it (stop_demo leaves it running: it also holds dev)"
    docker start recycle_pg | Out-Null
    $Flags["recycle_pg_started"] = $true
}
$t = 0
do { Start-Sleep -Seconds 2; $t += 2; $h = (docker inspect -f "{{.State.Health.Status}}" recycle_pg 2> $null) } until ($h -eq "healthy" -or $t -ge 120)
if ($h -ne "healthy") { Refuse 7 @("START_DEMO_FAILED: recycle_pg is not healthy after 120 s ($h).") }
Say "recycle_pg: healthy"
Save-State

# ---- 7. THE DEMO DATABASE ---------------------------------------------------------------------------
Say "building or refreshing the demo database recycle_demo ..."
$dbOut = & $Py (Join-Path $Root "tools\owner\demo_db.py") 2>&1 | ForEach-Object { "$_" }
$dbOut | ForEach-Object { Say "  $_" }
if (-not ($dbOut -contains "DEMO_DB_EXIT=0")) { Refuse 8 @("START_DEMO_FAILED: the demo database step did not print DEMO_DB_EXIT=0.") }
$ShopCode = (($dbOut | Where-Object { $_ -like "DEMO_SHOP_CODE=*" }) -replace "^DEMO_SHOP_CODE=", "")
$TenantId = (($dbOut | Where-Object { $_ -like "DEMO_TENANT_ID=*" }) -replace "^DEMO_TENANT_ID=", "")

# ---- 8. THE SERVER, in its own window ----------------------------------------------------------------
$server = Start-Process -FilePath $Py -ArgumentList ('"' + (Join-Path $Root "tools\owner\demo_server.py") + '"') -WorkingDirectory $Root -PassThru
Record "server" $server
$t = 0; $up = $false
do {
    Start-Sleep -Seconds 2; $t += 2
    try { $r = Invoke-WebRequest -UseBasicParsing -TimeoutSec 3 "http://127.0.0.1:8000/health"; $up = ($r.StatusCode -eq 200) } catch { }
} until ($up -or $t -ge 90)
if (-not $up) { Refuse 9 @("START_DEMO_FAILED: the server did not answer /health in 90 s. Run stop_demo, then read the server window.") }
Say "server: /health 200 on http://127.0.0.1:8000"

# ---- 9. THE EMULATOR (cold boot: CLAUDE.md, the quick-boot snapshot footgun) ------------------------
$env:ANDROID_HOME = $Sdk; $env:ANDROID_SDK_ROOT = $Sdk; $env:ANDROID_AVD_HOME = "E:\android\avd"
$adbBefore = @(Get-Process -Name adb -ErrorAction SilentlyContinue)
# 2> $null: the first adb call starts adb's own server and says so on stderr, which PowerShell would
# print as an error to the owner.
$devs = (& $Adb devices 2> $null) -join "`n"
if ($adbBefore.Count -eq 0) {
    $adbNow = Get-Process -Name adb -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($adbNow) { Record "adb-server" $adbNow }
}
if ($devs -match "emulator-\d+\s+device") {
    Say "an emulator is already running: using it (stop_demo will not stop it)"
    $Flags["emulator_reused"] = $true
} else {
    $emu = Start-Process -FilePath $Emu -ArgumentList "-avd $Avd -no-snapshot-load -no-snapshot-save" -PassThru
    Record "emulator" $emu
}
$t = 0; $booted = $false
do {
    Start-Sleep -Seconds 5; $t += 5
    $b = (& $Adb shell getprop sys.boot_completed 2> $null)
    $booted = ("$b".Trim() -eq "1")
} until ($booted -or $t -ge 300)
if (-not $booted) { Refuse 10 @("START_DEMO_FAILED: the emulator did not finish booting in 300 s. Run stop_demo.") }
Say "emulator: booted"

# ---- 10. METRO, in its own window, then the app --------------------------------------------------------
$metro = Start-Process -FilePath "cmd.exe" -ArgumentList '/c title Metro (phone app code) && npx expo start -c --dev-client --port 8081' -WorkingDirectory (Join-Path $Root "mobile") -PassThru
Record "metro" $metro
$t = 0; $ready = $false
do {
    Start-Sleep -Seconds 3; $t += 3
    # Metro's /status carries no text content type, so Invoke-WebRequest hands back BYTES and a
    # -match on them never matches (measured 2026-10-19: Metro was running and this timed out).
    try {
        $r = Invoke-WebRequest -UseBasicParsing -TimeoutSec 3 "http://127.0.0.1:8081/status"
        $body = if ($r.Content -is [byte[]]) { [System.Text.Encoding]::ASCII.GetString($r.Content) } else { [string]$r.Content }
        $ready = ($body -match "packager-status:running")
    } catch { }
} until ($ready -or $t -ge 180)
if (-not $ready) { Refuse 11 @("START_DEMO_FAILED: Metro did not report running in 180 s. Run stop_demo, then read the Metro window.") }
Say "metro: running on 8081"
# THE APP'S METRO ADDRESS. The debug build reads it from its own preference `debug_http_host`, and a
# walk may have left another port there (measured 2026-10-19: `10.0.2.2:8082`, a lane's old Metro ->
# "Unable to load script"). Point it at THIS Metro before the app opens; 10.0.2.2 is the host as the
# emulator sees it. Written through a file in /data/local/tmp because run-as cannot take a redirect.
$prefs = "shared_prefs/$AppId" + "_preferences.xml"
$want = "10.0.2.2:8081"
$have = ((& $Adb shell run-as $AppId cat $prefs 2> $null) -join "`n")
if ($have -notmatch [regex]::Escape(">$want<")) {
    if ($Flags["emulator_reused"]) {
        # Setting it means stopping the app, and on an emulator this file did not start that app
        # may be someone else's work in progress.
        Refuse 12 @("START_DEMO_REFUSED: the running emulator's app points at another Metro ($have); start_demo will not stop an app on an emulator it did not start.",
                    "แอปในโทรศัพท์จำลองที่เปิดอยู่ก่อนแล้วชี้ไปที่ Metro ตัวอื่น ปิดโทรศัพท์จำลองนั้นก่อน แล้วดับเบิลคลิก start_demo อีกครั้ง")
    }
    $xml = "<?xml version='1.0' encoding='utf-8' standalone='yes' ?>`n<map>`n    <string name=`"debug_http_host`">$want</string>`n</map>`n"
    $tmp = Join-Path $State "debug_prefs.xml"
    [System.IO.File]::WriteAllText($tmp, $xml, $Utf8)
    & $Adb push $tmp /data/local/tmp/recycle_demo_prefs.xml *> $null
    & $Adb shell am force-stop $AppId *> $null
    & $Adb shell run-as $AppId mkdir -p shared_prefs *> $null
    & $Adb shell run-as $AppId cp /data/local/tmp/recycle_demo_prefs.xml $prefs *> $null
    $check = ((& $Adb shell run-as $AppId cat $prefs 2> $null) -join "`n")
    if ($check -notmatch [regex]::Escape(">$want<")) { Refuse 12 @("START_DEMO_FAILED: could not point the app at Metro ($want). Run stop_demo.") }
    Say "app: its Metro address was not $want; set it"
}
& $Adb shell monkey -p $AppId -c android.intent.category.LAUNCHER 1 *> $null
Say "app: opened ($AppId); its first start builds the bundle and takes about a minute"

# ---- 11. THE DESKTOP PROGRAM, pointed at the demo server -------------------------------------------
$ud = Join-Path $State "desktop-userdata"
New-Item -ItemType Directory -Force -Path $ud | Out-Null
$cfg = [pscustomobject]@{ apiBase = "http://127.0.0.1:8000"; shopCode = $ShopCode; tenantId = $TenantId } | ConvertTo-Json
[System.IO.File]::WriteAllText((Join-Path $ud "config.json"), $cfg, $Utf8)
$env:RECYCLE_USER_DATA = $ud
$desk = Start-Process -FilePath "cmd.exe" -ArgumentList '/c title Desktop program (build, then run) && npm start' -WorkingDirectory (Join-Path $Root "desktop") -PassThru
Remove-Item Env:\RECYCLE_USER_DATA
Record "desktop" $desk

Say ""
Say "START_DEMO_OK"
Say "  shop code (รหัสร้าน): $ShopCode"
Say "  usernames: admin (ผู้ดูแล), staff (พนักงาน) -- passwords: see docs\owner\วิธีเปิดระบบ.md (never printed)"
Say "  server: http://127.0.0.1:8000 on this machine; the phone app calls $baked"
Say "  PIDs recorded in $PidFile -- stop everything with stop_demo"
Say "START_DEMO_EXIT=0"
exit 0
