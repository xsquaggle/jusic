# The "any media" proof (REDESIGN_PLAN.md, section 6b): reads Windows' own list of playing media
# (the one behind the media keys and the volume flyout) and prints every change as one line of JSON.
# Commands come in on stdin, one a line: play | pause | toggle | next | prev | seek <seconds>.
# It ends when stdin closes, so it dies with whatever started it. Nothing is installed: Windows
# PowerShell reaches the Windows Runtime API directly.
#
#   -Only <text>     follow the first source whose app id contains this, instead of the one Windows calls current
#   -ThumbDir <dir>  where the current artwork is written (one file, replaced as it changes)
#   -List            print the app ids of all sources (no titles) and stop
#
# What the owner is listening to is private. This script writes titles only to its stdout, for the
# widget; nothing here logs them, and whoever reads the stdout must not either.
param([string]$Only = '', [string]$ThumbDir = '.', [int]$Every = 400, [switch]$List)

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Add-Type -AssemblyName System.Runtime.WindowsRuntime

$asTask = [System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
  $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1'
} | Select-Object -First 1
function Await($operation, [Type]$type) {
  $task = $asTask.MakeGenericMethod($type).Invoke($null, @($operation))
  if (-not $task.Wait(4000)) { throw 'timed out' }
  $task.Result
}

$ManagerType = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media.Control, ContentType = WindowsRuntime]
$PropertiesType = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties, Windows.Media.Control, ContentType = WindowsRuntime]
$StreamType = [Windows.Storage.Streams.IRandomAccessStreamWithContentType, Windows.Storage.Streams, ContentType = WindowsRuntime]
$InputType = [Windows.Storage.Streams.IInputStream, Windows.Storage.Streams, ContentType = WindowsRuntime]
$asStream = [System.IO.WindowsRuntimeStreamExtensions].GetMethod('AsStreamForRead', [Type[]]@($InputType))
$manager = Await ($ManagerType::RequestAsync()) $ManagerType

if ($List) {
  foreach ($s in $manager.GetSessions()) { [Console]::Out.WriteLine($s.SourceAppUserModelId) }
  exit 0
}

function Pick {
  if ($Only) { return $manager.GetSessions() | Where-Object { $_.SourceAppUserModelId -like "*$Only*" } | Select-Object -First 1 }
  $manager.GetCurrentSession()
}

$thumbFile = Join-Path $ThumbDir 'now-playing-thumb'
$thumbStamp = ''      # length and a few bytes of the artwork last written
$thumbSerial = 0
$thumbTries = 0
$lastKey = ''
$lastLine = ''

function ReadThumb($props) {
  # The artwork often arrives a moment after the title, so this is tried for a few rounds after a change.
  try {
    if (-not $props.Thumbnail) { [Console]::Error.WriteLine('no thumbnail offered'); return $null }
    $ras = Await ($props.Thumbnail.OpenReadAsync()) $StreamType
    # (Called through reflection: PowerShell cannot pick the overload for a Windows Runtime object itself.)
    $net = $asStream.Invoke($null, @($ras))
    $mem = New-Object System.IO.MemoryStream
    $net.CopyTo($mem); $net.Dispose()
    $bytes = $mem.ToArray()
    if ($bytes.Length -lt 64) { return $null }
    return ,$bytes
  } catch { [Console]::Error.WriteLine('thumbnail: ' + $_.Exception.Message); return $null }
}

function Emit($session) {
  if (-not $session) {
    $line = '{"source":null}'
  } else {
    $props = Await ($session.TryGetMediaPropertiesAsync()) $PropertiesType
    $info = $session.GetPlaybackInfo()
    $controls = $info.Controls
    $time = $session.GetTimelineProperties()
    $key = $session.SourceAppUserModelId + '|' + $props.Title + '|' + $props.Artist + '|' + $props.AlbumTitle
    if ($key -ne $script:lastKey) { $script:lastKey = $key; $script:thumbTries = 8; $script:thumbStamp = ''; $script:thumbSerial++ ; Remove-Item $thumbFile -ErrorAction SilentlyContinue }
    if ($script:thumbTries -gt 0) {
      $script:thumbTries--
      $bytes = ReadThumb $props
      if ($bytes) {
        $stamp = '' + $bytes.Length + ':' + $bytes[40] + ':' + $bytes[$bytes.Length - 20]
        if ($stamp -ne $script:thumbStamp) {
          [System.IO.File]::WriteAllBytes($thumbFile, $bytes)
          $script:thumbStamp = $stamp; $script:thumbSerial++
        }
      }
    }
    $rate = 1.0
    if ($info.PlaybackRate) { $rate = [double]$info.PlaybackRate }
    $state = [ordered]@{
      source = $session.SourceAppUserModelId
      title = $props.Title; artist = $props.Artist
      playing = ([int]$info.PlaybackStatus -eq 4)
      position = [math]::Round($time.Position.TotalSeconds, 2)
      duration = [math]::Round(($time.EndTime - $time.StartTime).TotalSeconds, 2)
      updatedAt = $time.LastUpdatedTime.ToUnixTimeMilliseconds()
      rate = $rate
      canPlay = [bool]$controls.IsPlayEnabled; canPause = [bool]$controls.IsPauseEnabled
      canToggle = [bool]$controls.IsPlayPauseToggleEnabled
      canNext = [bool]$controls.IsNextEnabled; canPrev = [bool]$controls.IsPreviousEnabled
      canSeek = [bool]$controls.IsPlaybackPositionEnabled
      thumb = $(if ($script:thumbStamp) { $thumbFile } else { $null })
      thumbSerial = $script:thumbSerial
    }
    $line = $state | ConvertTo-Json -Compress
  }
  if ($line -ne $script:lastLine) { $script:lastLine = $line; [Console]::Out.WriteLine($line); [Console]::Out.Flush() }
}

function Command($session, [string]$text) {
  if (-not $session) { return }
  $parts = $text.Trim().Split(' ')
  $info = $session.GetPlaybackInfo()
  $op = $null
  switch ($parts[0]) {
    'play' { $op = $session.TryPlayAsync() }
    'pause' { $op = $session.TryPauseAsync() }
    'toggle' { if ([int]$info.PlaybackStatus -eq 4) { $op = $session.TryPauseAsync() } else { $op = $session.TryPlayAsync() } }
    'next' { $op = $session.TrySkipNextAsync() }
    'prev' { $op = $session.TrySkipPreviousAsync() }
    'seek' { $op = $session.TryChangePlaybackPositionAsync([long]([double]$parts[1] * 10000000)) }
  }
  if ($op) { try { [void](Await $op ([bool])) } catch { } }
}

# (The raw stream: under -File, [Console]::In reports the end of input at once.)
$stdin = New-Object System.IO.StreamReader([Console]::OpenStandardInput())
$pending = $stdin.ReadLineAsync()
while ($true) {
  $session = $null
  try { $session = Pick } catch { }
  while ($pending.IsCompleted) {
    $text = $pending.Result
    if ($null -eq $text) { exit 0 }
    try { Command $session $text } catch { }
    $pending = $stdin.ReadLineAsync()
  }
  try { Emit $session } catch { [Console]::Error.WriteLine($_.Exception.Message + ' @ ' + $_.InvocationInfo.ScriptLineNumber) }
  [void]$pending.Wait($Every)
}
