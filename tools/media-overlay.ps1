# Shows what Windows' media overlay (the one the volume keys bring up) knows, and can press its
# buttons, which is what a keyboard's media keys do. Used to check the desktop app without a keyboard.
#   powershell -ExecutionPolicy Bypass -File tools\media-overlay.ps1 [-Press toggle|next|prev] [-App jusic]
param([string]$Press = '', [string]$App = 'jusic')

Add-Type -AssemblyName System.Runtime.WindowsRuntime
$asTask = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
  $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' })[0]
function Await($operation, $type) { $task = $asTask.MakeGenericMethod($type).Invoke($null, @($operation)); [void]$task.Wait(5000); $task.Result }

$null = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media.Control, ContentType = WindowsRuntime]
$manager = Await ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]::RequestAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager])
foreach ($session in $manager.GetSessions()) {
  $media = Await ($session.TryGetMediaPropertiesAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties])
  "$($session.SourceAppUserModelId) | $($media.Title) | $($media.Artist) | $($session.GetPlaybackInfo().PlaybackStatus)"
  if ($Press -and $session.SourceAppUserModelId -like "*$App*") {
    $done = switch ($Press) {
      'toggle' { Await ($session.TryTogglePlayPauseAsync()) ([bool]) }
      'next'   { Await ($session.TrySkipNextAsync()) ([bool]) }
      'prev'   { Await ($session.TrySkipPreviousAsync()) ([bool]) }
    }
    "  pressed $Press : $done"
  }
}
