# stop_demo.ps1 -- stops ONLY what start_demo started, read from its PID file. Double-click
# tools\owner\stop_demo.cmd. A PID is stopped only while it still carries the start time
# start_demo recorded (Windows reuses PIDs); its child processes are listed and stopped with it.
# It never stops anything else, never touches dev, never drops a database, and leaves Docker and
# recycle_pg running (recycle_pg also holds dev).
#
# THIS FILE IS SAVED WITH A UTF-8 BOM because it holds Thai text (CLAUDE.md, Machine footguns).

$ErrorActionPreference = "Continue"
try { [Console]::OutputEncoding = New-Object System.Text.UTF8Encoding $false } catch { }

$State = Join-Path $env:LOCALAPPDATA "recycle-demo"
$PidFile = Join-Path $State "pids.json"
if (-not (Test-Path -LiteralPath $PidFile)) {
    Write-Host "STOP_DEMO: no PID file ($PidFile) -- start_demo has nothing running. Nothing was stopped."
    Write-Host "ไม่มีระบบสาธิตที่เปิดอยู่ ไม่ได้ปิดอะไร"
    Write-Host "STOP_DEMO_EXIT=0"
    exit 0
}
$state = Get-Content -LiteralPath $PidFile -Raw -Encoding UTF8 | ConvertFrom-Json
$all = @(Get-CimInstance Win32_Process | Select-Object ProcessId, ParentProcessId, Name, CreationDate)

function Get-Tree([int]$rootPid, [datetime]$rootStart) {
    # Children are matched by parent PID AND by starting no earlier than their parent, so a
    # recycled parent PID never pulls in an unrelated process.
    $out = New-Object System.Collections.ArrayList
    $queue = New-Object System.Collections.Queue
    $queue.Enqueue(@($rootPid, $rootStart))
    while ($queue.Count -gt 0) {
        $item = $queue.Dequeue()
        foreach ($c in $all | Where-Object { $_.ParentProcessId -eq $item[0] -and $_.CreationDate -ge $item[1].AddSeconds(-1) }) {
            [void]$out.Add($c)
            $queue.Enqueue(@([int]$c.ProcessId, [datetime]$c.CreationDate))
        }
    }
    return $out
}

$stopped = New-Object System.Collections.ArrayList
$Adb = "E:\android\sdk\platform-tools\adb.exe"
$emuEntry = @($state.started | Where-Object { $_.name -eq "emulator" }) | Select-Object -First 1
if ($emuEntry) {
    $ep = Get-Process -Id $emuEntry.pid -ErrorAction SilentlyContinue
    if ($ep -and $ep.StartTime.ToUniversalTime().ToString("o") -eq $emuEntry.start) {
        # Ask the emulator start_demo started to shut down cleanly first: a killed qemu can leave
        # the AVD's lock files behind. Only that emulator's console is addressed.
        $serials = @((& $Adb devices) | Select-String -Pattern "^(emulator-\d+)\s" | ForEach-Object { $_.Matches[0].Groups[1].Value })
        # start_demo starts an emulator only when none is running, so ONE serial is that one; with
        # more than one, it cannot tell which is its own, and falls through to stopping its PID tree.
        if ($serials.Count -eq 1) { & $Adb -s $serials[0] emu kill *> $null }
        $t = 0
        while ((Get-Process -Id $emuEntry.pid -ErrorAction SilentlyContinue) -and $t -lt 30) { Start-Sleep -Seconds 1; $t++ }
        if (-not (Get-Process -Id $emuEntry.pid -ErrorAction SilentlyContinue)) {
            [void]$stopped.Add(("emulator pid={0} (emulator, shut down through its console)" -f $emuEntry.pid))
        }
    }
}
$entries = @($state.started)
[array]::Reverse($entries)
$gracefulPid = if ($emuEntry -and -not (Get-Process -Id $emuEntry.pid -ErrorAction SilentlyContinue)) { $emuEntry.pid } else { $null }
foreach ($e in $entries) {
    $p = Get-Process -Id $e.pid -ErrorAction SilentlyContinue
    if (-not $p) {
        # The emulator shut down through its console above is already listed as stopped.
        if ($e.pid -ne $gracefulPid) { Write-Host ("  {0,-16} pid={1}: already gone" -f $e.name, $e.pid) }
        continue
    }
    if ($p.StartTime.ToUniversalTime().ToString("o") -ne $e.start) {
        Write-Host ("  {0,-16} pid={1}: NOT TOUCHED -- this PID now belongs to another program ({2})" -f $e.name, $e.pid, $p.ProcessName)
        continue
    }
    $tree = @(Get-Tree $e.pid $p.StartTime)
    # Leaves first, then the recorded process itself.
    for ($i = $tree.Count - 1; $i -ge 0; $i--) {
        $c = $tree[$i]
        $cp = Get-Process -Id $c.ProcessId -ErrorAction SilentlyContinue
        if ($cp) {
            Stop-Process -Id $c.ProcessId -Force -ErrorAction SilentlyContinue
            [void]$stopped.Add(("{0} pid={1} ({2}, child of {3})" -f $e.name, $c.ProcessId, $c.Name, $e.pid))
        }
    }
    Stop-Process -Id $e.pid -Force -ErrorAction SilentlyContinue
    [void]$stopped.Add(("{0} pid={1} ({2})" -f $e.name, $e.pid, $p.ProcessName))
}

Write-Host "STOPPED ($($stopped.Count)):"
foreach ($s in $stopped) { Write-Host "  $s" }
$f = $state.flags
if ($f.emulator_reused) { Write-Host "  (the emulator was already running before start_demo: left running)" }
if ($f.recycle_pg_started -or $f.docker_desktop_started) { Write-Host "  (Docker / recycle_pg were started by start_demo but are left running: recycle_pg also holds dev)" }
Start-Sleep -Seconds 2
$left = @($entries | Where-Object { $_ -and (Get-Process -Id $_.pid -ErrorAction SilentlyContinue) -and
    ((Get-Process -Id $_.pid).StartTime.ToUniversalTime().ToString("o") -eq $_.start) })
if ($left.Count -gt 0) {
    Write-Host "STOP_DEMO: still alive: $(($left | ForEach-Object { "$($_.name) pid=$($_.pid)" }) -join ', ')"
    Write-Host "STOP_DEMO_EXIT=1"
    exit 1
}
Remove-Item -LiteralPath $PidFile
Write-Host "ปิดระบบสาธิตเรียบร้อย (ฐานข้อมูล recycle_demo ยังอยู่ เปิดครั้งหน้าจะได้ข้อมูลเดิม)"
Write-Host "STOP_DEMO_EXIT=0"
exit 0
