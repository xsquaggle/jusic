# Samples the CPU time and private memory of whole process trees, once a second.
#
#   powershell -NoProfile -File tools/perf/sample.ps1 -Roots 1234,5678
#
# Every sample re-lists the processes (they come and go) and walks ParentProcessId down
# from the roots. One JSON line per sample:
#   {"t":<ms>,"sys":<machine busy, 100 ns, all processors>,"p":[[pid,"exe",<cpu 100 ns>,<private bytes>],...]}
# The caller turns the differences into a share of the whole machine.
param([Parameter(Mandatory = $true)][string]$Roots, [int]$IntervalMs = 1000)

Add-Type -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;

public static class Perf {
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
  struct Entry {
    public uint size, usage, pid; public IntPtr heap; public uint module, threads, parent;
    public int priority; public uint flags;
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 260)] public string exe;
  }
  [StructLayout(LayoutKind.Sequential)]
  struct Memory {
    public uint cb, faults;
    public UIntPtr peakWs, ws, peakPaged, paged, peakNonPaged, nonPaged, pagefile, peakPagefile, priv;
  }
  [DllImport("kernel32")] static extern IntPtr CreateToolhelp32Snapshot(uint flags, uint pid);
  [DllImport("kernel32", CharSet = CharSet.Unicode)] static extern bool Process32FirstW(IntPtr snap, ref Entry e);
  [DllImport("kernel32", CharSet = CharSet.Unicode)] static extern bool Process32NextW(IntPtr snap, ref Entry e);
  [DllImport("kernel32")] static extern IntPtr OpenProcess(uint access, bool inherit, uint pid);
  [DllImport("kernel32")] static extern bool CloseHandle(IntPtr h);
  [DllImport("kernel32")] static extern bool GetProcessTimes(IntPtr h, out long created, out long exited, out long kernel, out long user);
  [DllImport("kernel32")] static extern bool GetSystemTimes(out long idle, out long kernel, out long user);
  [DllImport("psapi")] static extern bool GetProcessMemoryInfo(IntPtr h, out Memory m, uint cb);

  static string Sample(uint[] roots, double t) {
    var parent = new Dictionary<uint, uint>();
    var name = new Dictionary<uint, string>();
    var kids = new Dictionary<uint, List<uint>>();
    IntPtr snap = CreateToolhelp32Snapshot(2, 0);
    var e = new Entry(); e.size = (uint)Marshal.SizeOf(typeof(Entry));
    if (Process32FirstW(snap, ref e)) do {
      parent[e.pid] = e.parent; name[e.pid] = e.exe;
      if (!kids.ContainsKey(e.parent)) kids[e.parent] = new List<uint>();
      kids[e.parent].Add(e.pid);
    } while (Process32NextW(snap, ref e));
    CloseHandle(snap);

    long idle, kernel, user; GetSystemTimes(out idle, out kernel, out user);   // kernel includes idle
    var sb = new StringBuilder();
    sb.Append("{\"t\":").Append((long)t).Append(",\"sys\":").Append(kernel + user - idle).Append(",\"p\":[");
    var queue = new Queue<KeyValuePair<uint, long>>();
    foreach (uint r in roots) if (name.ContainsKey(r)) queue.Enqueue(new KeyValuePair<uint, long>(r, 0));
    var seen = new HashSet<uint>();
    bool first = true;
    while (queue.Count > 0) {
      var item = queue.Dequeue();
      uint pid = item.Key;
      if (!seen.Add(pid)) continue;
      IntPtr h = OpenProcess(0x1000, false, pid);          // PROCESS_QUERY_LIMITED_INFORMATION
      if (h == IntPtr.Zero) continue;
      long created, exited, k, u; Memory m; m.priv = UIntPtr.Zero;
      bool ok = GetProcessTimes(h, out created, out exited, out k, out u);
      GetProcessMemoryInfo(h, out m, (uint)Marshal.SizeOf(typeof(Memory)));
      CloseHandle(h);
      // A recycled pid can leave a stale parent link: a real child is never older than its parent.
      if (!ok || created < item.Value) continue;
      if (!first) sb.Append(','); first = false;
      sb.Append('[').Append(pid).Append(",\"").Append(name[pid]).Append("\",").Append(k + u).Append(',').Append(m.priv.ToUInt64()).Append(']');
      List<uint> list;
      if (kids.TryGetValue(pid, out list)) foreach (uint c in list) queue.Enqueue(new KeyValuePair<uint, long>(c, created));
    }
    return sb.Append("]}").ToString();
  }

  public static void Run(uint[] roots, int intervalMs) {
    var clock = System.Diagnostics.Stopwatch.StartNew();
    for (long n = 1; ; n++) {
      Console.Out.WriteLine(Sample(roots, clock.Elapsed.TotalMilliseconds));
      Console.Out.Flush();
      double wait = n * intervalMs - clock.Elapsed.TotalMilliseconds;
      if (wait > 0) Thread.Sleep((int)wait);
    }
  }
}
'@

[Perf]::Run([uint32[]]($Roots -split ','), $IntervalMs)
