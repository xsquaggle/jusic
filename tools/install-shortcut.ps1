# Creates the jusic shortcuts. Re-run this if you move the folder or the icon changes.
#   powershell -ExecutionPolicy Bypass -File tools\install-shortcut.ps1
# Remove them again with:  -Uninstall
# -Frosted makes (or with -Uninstall removes) a separate "Jusic frosted" desktop shortcut for the
# desktop app in this folder, and leaves the jusic shortcuts alone.

param(
    [switch]$Uninstall,
    [switch]$NoStartMenu,
    [switch]$Frosted
)

$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$icon = Join-Path $root 'jusic.ico'
$entry = Join-Path $root 'server.js'

$desktop = [Environment]::GetFolderPath('Desktop')
$startMenu = Join-Path ([Environment]::GetFolderPath('StartMenu')) 'Programs'

if ($Frosted) {
    # electron.exe is a windowed program, so there is no console to hide.
    $electron = Join-Path $root 'node_modules\electron\dist\electron.exe'
    $path = Join-Path $desktop 'Jusic frosted.lnk'
    if ($Uninstall) { if (Test-Path $path) { Remove-Item $path -Force; Write-Host "removed $path" }; return }
    if (-not (Test-Path $electron)) { throw 'Electron is not installed here. Run: npm install' }
    $link = (New-Object -ComObject WScript.Shell).CreateShortcut($path)
    $link.TargetPath = $electron
    $link.Arguments = '"{0}"' -f $root
    $link.WorkingDirectory = $root
    $link.IconLocation = "$icon,0"
    $link.Description = 'Jusic - frosted glass, desktop app'
    $link.Save()
    Write-Host "created $path"
    return
}

$targets = @(Join-Path $desktop 'jusic.lnk')
if (-not $NoStartMenu) { $targets += Join-Path $startMenu 'jusic.lnk' }

if ($Uninstall) {
    foreach ($path in $targets) {
        if (Test-Path $path) { Remove-Item $path -Force; Write-Host "removed $path" }
    }
    return
}

$node = (Get-Command node -ErrorAction SilentlyContinue).Source
if (-not $node) {
    $fallback = Join-Path $env:ProgramFiles 'nodejs\node.exe'
    if (Test-Path $fallback) {
        $node = $fallback
    } else {
        throw 'Node.js was not found. Install it from https://nodejs.org, then run this again.'
    }
}

if (-not (Test-Path $entry)) { throw "server.js not found at $entry" }
if (-not (Test-Path $icon))  { throw "jusic.ico not found - run: node tools\make-icons.js" }

$shell = New-Object -ComObject WScript.Shell
foreach ($path in $targets) {
    $parent = Split-Path -Parent $path
    if (-not (Test-Path $parent)) { New-Item -ItemType Directory -Path $parent -Force | Out-Null }

    $link = $shell.CreateShortcut($path)
    $link.TargetPath = $node
    $link.Arguments = '"{0}" --app' -f $entry
    $link.WorkingDirectory = $root
    $link.IconLocation = "$icon,0"
    $link.Description = 'jusic - your local music library'
    # 7 = minimised: node relaunches itself hidden and exits, so the console
    # that Windows insists on giving it never takes over the screen.
    $link.WindowStyle = 7
    $link.Save()
    Write-Host "created $path"
}

Write-Host ''
Write-Host 'Done. Double-click jusic on your desktop to start listening.'
