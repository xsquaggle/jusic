# Places, sizes, minimises and covers the app window with Win32 calls, so measurement runs never
# touch the real mouse, and never take the keyboard focus from whoever is using the PC.
#
#   powershell -NoProfile -File tools/perf/win.ps1 -Op place -ProcId 1234 [-Screen other|main]
#
# Ops: where   prints "x y foreground-window" for the chosen screen (no -ProcId needed)
#      place   restore to -W x -H on the chosen screen     max / min   maximise / minimise
#      resize  the S6 loop: sizes swept 60 times a second, then maximise and restore -Count times
#      cover   an opaque topmost window over the app for -Seconds (the one thing a run shows in view)
# -Behind keeps the app window (and the cover) at the bottom of the window stack, under whatever
# the owner has open, so a run is never in the way. The runner then turns Chromium's occlusion
# check off, so the page renders as it would in view.
# -Screen other (the default) is the first monitor that is not the primary one: the owner works on
# the primary. This process is not DPI-aware on purpose: Windows then takes sizes in the units the
# page uses (CSS pixels at the monitor's scale), so 1380 x 900 here is 1380 x 900 there.
param([Parameter(Mandatory = $true)][string]$Op, [int]$ProcId = 0, [string]$Screen = 'other',
      [int]$W = 1380, [int]$H = 900, [double]$Seconds = 20, [int]$Count = 10, [long]$Back = 0, [switch]$Behind)

Add-Type -AssemblyName System.Windows.Forms, System.Drawing
Add-Type -ReferencedAssemblies System.Windows.Forms, System.Drawing -TypeDefinition @'
using System;
using System.Drawing;
using System.Runtime.InteropServices;
using System.Threading;
using System.Windows.Forms;

public static class Win {
  [StructLayout(LayoutKind.Sequential)] public struct Rect { public int l, t, r, b; }
  [DllImport("user32")] static extern bool SetWindowPos(IntPtr h, IntPtr after, int x, int y, int w, int hgt, uint flags);
  [DllImport("user32")] static extern bool ShowWindow(IntPtr h, int cmd);
  [DllImport("user32")] public static extern bool GetWindowRect(IntPtr h, out Rect r);
  [DllImport("user32")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32")] static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32")] static extern uint GetWindowThreadProcessId(IntPtr h, IntPtr pid);
  [DllImport("user32")] static extern bool AttachThreadInput(uint from, uint to, bool attach);
  [DllImport("kernel32")] static extern uint GetCurrentThreadId();
  const uint Quiet = 0x0004 | 0x0010;                       // no z-order change, no activation
  public static bool Behind;
  static void Sink(IntPtr h) { if (Behind) SetWindowPos(h, (IntPtr)1, 0, 0, 0, 0, 0x0001 | 0x0002 | 0x0010); }   // to the bottom of the stack
  static void Up() { Console.Out.WriteLine("up"); Console.Out.Flush(); }   // tells the runner the measured part starts now

  /** Shows the window some way, then hands the focus straight back if the app took it. */
  public static void Show(IntPtr h, int cmd, IntPtr back) {
    IntPtr before = back != IntPtr.Zero ? back : GetForegroundWindow();
    ShowWindow(h, cmd);
    Sink(h);
    if (before == h || before == IntPtr.Zero || GetForegroundWindow() != h) return;
    // Windows only lets the foreground thread pass the focus on, so borrow its input queue for a moment.
    uint front = GetWindowThreadProcessId(h, IntPtr.Zero), me = GetCurrentThreadId();
    AttachThreadInput(me, front, true); SetForegroundWindow(before); AttachThreadInput(me, front, false);
  }

  public static void Place(IntPtr h, int x, int y, int w, int hgt, IntPtr back) { Show(h, 4, back); SetWindowPos(h, IntPtr.Zero, x, y, w, hgt, Quiet); Sink(h); }

  // S6: sizes sweep between 1100 x 700 and 1700 x 1050 about 60 times a second, then maximise and restore.
  public static void Resize(IntPtr h, int x, int y, int w, int hgt, double seconds, int count) {
    Up();
    var clock = System.Diagnostics.Stopwatch.StartNew();
    for (long n = 0; clock.Elapsed.TotalSeconds < seconds; n++) {
      double k = 0.5 - 0.5 * Math.Cos(clock.Elapsed.TotalSeconds * Math.PI);            // 2 s there and back
      SetWindowPos(h, IntPtr.Zero, x, y, (int)(1100 + 600 * k), (int)(700 + 350 * k), Quiet);
      double wait = (n + 1) * 1000.0 / 60 - clock.Elapsed.TotalMilliseconds;
      if (wait > 0) Thread.Sleep((int)wait);
    }
    SetWindowPos(h, IntPtr.Zero, x, y, w, hgt, Quiet);
    for (int i = 0; i < count; i++) { Show(h, 3, IntPtr.Zero); Thread.Sleep((int)(seconds * 500 / count)); Show(h, 4, IntPtr.Zero); Thread.Sleep((int)(seconds * 500 / count)); }
  }

  class Cover : Form {
    protected override bool ShowWithoutActivation { get { return true; } }
    // Topmost from birth and shown without taking the focus. Not WS_EX_NOACTIVATE: Chromium's occlusion
    // check ignores such windows, and the page under one then never learns it is covered.
    protected override CreateParams CreateParams { get { var p = base.CreateParams; p.ExStyle |= 0x8; return p; } }
  }
  /** A plain opaque window over the app for a while: the page should report itself hidden. */
  public static void CoverFor(Rectangle where, double seconds) {
    var form = new Cover { FormBorderStyle = FormBorderStyle.None, StartPosition = FormStartPosition.Manual, Bounds = where,
                           BackColor = Color.FromArgb(24, 24, 28), ShowInTaskbar = false, Text = "jusic perf" };
    var timer = new System.Windows.Forms.Timer { Interval = (int)(seconds * 1000) };
    timer.Tick += (s, e) => form.Close();
    form.Shown += (s, e) => { timer.Start(); Up(); };
    Application.Run(form);
  }
}
'@

[Win]::Behind = $Behind.IsPresent
$all = [Windows.Forms.Screen]::AllScreens
$scr = if ($Screen -eq 'other' -and $all.Count -gt 1) { $all | Where-Object { -not $_.Primary } | Select-Object -First 1 } else { [Windows.Forms.Screen]::PrimaryScreen }
$x = $scr.WorkingArea.Left + [Math]::Max(0, [int](($scr.WorkingArea.Width - 1700) / 2))     # room for S6's widest size
$y = $scr.WorkingArea.Top
if ($Op -eq 'where') { "$x $y $([Win]::GetForegroundWindow())"; return }

$hwnd = (Get-Process -Id $ProcId).MainWindowHandle      # not $h: that would be the -H parameter
if ($hwnd -eq [IntPtr]::Zero) { throw "process $ProcId has no window" }
$r = New-Object Win+Rect
switch ($Op) {
  'place'  { [Win]::Place($hwnd, $x, $y, $W, $H, [IntPtr]$Back) }
  'max'    { [Win]::Show($hwnd, 3, [IntPtr]::Zero) }
  'min'    { [Win]::Show($hwnd, 7, [IntPtr]::Zero) }
  'resize' { [Win]::Resize($hwnd, $x, $y, $W, $H, $Seconds, $Count) }
  'cover'  { [void][Win]::GetWindowRect($hwnd, [ref]$r); [Win]::CoverFor((New-Object Drawing.Rectangle ($r.l - 20), ($r.t - 20), ($r.r - $r.l + 40), ($r.b - $r.t + 40)), $Seconds) }
  default  { throw "unknown op $Op" }
}
