# Stops whatever an interrupted measurement run left behind: the runner, its samplers, the test
# server and the test window. It matches on this repo's own command lines, so the daily app (a
# different folder and profile) and the Mercury widget (also Electron) are never touched.
$mine = Get-CimInstance Win32_Process -Filter "Name='powershell.exe' or Name='node.exe' or Name='typeperf.exe' or Name='msedge.exe' or Name='chrome.exe' or Name='electron.exe'" |
  Where-Object {
    $_.ProcessId -ne $PID -and (
      $_.CommandLine -like '*tools\perf\sample.ps1*' -or $_.CommandLine -like '*tools\perf\win.ps1*' -or
      $_.CommandLine -like '*tools/perf/run.js*' -or $_.CommandLine -like '*GPU Engine(*engtype_3D)*' -or
      $_.CommandLine -like '*server.js --no-open --port*' -or $_.CommandLine -like '*jusic-redesign\data\window*' -or
      ($_.Name -eq 'electron.exe' -and $_.CommandLine -like '* --perf*' -and $_.CommandLine -notlike '*widget-proto*'))
  }
foreach ($p in $mine) { Stop-Process -Id $p.ProcessId -Force -ErrorAction SilentlyContinue }
"stopped $(@($mine).Count) processes: $((@($mine) | Group-Object Name | ForEach-Object { "$($_.Count) $($_.Name)" }) -join ', ')"
