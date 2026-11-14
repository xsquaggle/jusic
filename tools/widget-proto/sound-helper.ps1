# Listens to what the PC is playing, for the "any media" widget, and prints its spectrum about 30
# times a second as a line: "B" and 16 numbers from 0 to 1, low to high (how loud each band is, on
# a decibel scale from -100 to -10). Nothing is recorded, stored or sent: the sound is analysed
# and dropped.
#
# Why this and not the browser's own loopback: that hears only the output Windows calls the
# default. On a PC with several outputs (a mixer such as SteelSeries Sonar, a USB interface,
# headphones) the music may be going out through another one, and the widget heard nothing. This
# looks at every active output, listens to the one that carries the most sound, and moves when
# another takes over.
#
# It ends when stdin closes. -Seconds N stops it after N seconds (for tests).
param([int]$Seconds = 0)

$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Globalization;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;

public static class SoundLoop {
  [ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")] class MMDeviceEnumerator { }

  [Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IMMDeviceEnumerator {
    [PreserveSig] int EnumAudioEndpoints(int dataFlow, int stateMask, out IMMDeviceCollection devices);
  }
  [Guid("0BD7A1BE-7A1A-44DB-8397-CC5392387B5E"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IMMDeviceCollection {
    [PreserveSig] int GetCount(out int count);
    [PreserveSig] int Item(int index, out IMMDevice device);
  }
  [Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IMMDevice {
    [PreserveSig] int Activate(ref Guid iid, int clsCtx, IntPtr activationParams, [MarshalAs(UnmanagedType.IUnknown)] out object obj);
  }
  [Guid("C02216F6-8C67-4B5B-9D00-D008E73E0064"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IAudioMeterInformation {
    [PreserveSig] int GetPeakValue(out float peak);
  }
  [Guid("1CB9AD4C-DBFA-4c32-B178-C2F568A703B2"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IAudioClient {
    [PreserveSig] int Initialize(int shareMode, int streamFlags, long bufferDuration, long periodicity, IntPtr format, IntPtr sessionGuid);
    [PreserveSig] int GetBufferSize(out uint frames);
    [PreserveSig] int GetStreamLatency(out long latency);
    [PreserveSig] int GetCurrentPadding(out uint frames);
    [PreserveSig] int IsFormatSupported(int shareMode, IntPtr format, out IntPtr closest);
    [PreserveSig] int GetMixFormat(out IntPtr format);
    [PreserveSig] int GetDevicePeriod(out long defaultPeriod, out long minimumPeriod);
    [PreserveSig] int Start();
    [PreserveSig] int Stop();
    [PreserveSig] int Reset();
    [PreserveSig] int SetEventHandle(IntPtr handle);
    [PreserveSig] int GetService(ref Guid iid, [MarshalAs(UnmanagedType.IUnknown)] out object obj);
  }
  [Guid("C8ADBD64-E71E-48a0-A4DE-185C395CD317"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IAudioCaptureClient {
    [PreserveSig] int GetBuffer(out IntPtr data, out int frames, out int flags, out long devicePosition, out long qpcPosition);
    [PreserveSig] int ReleaseBuffer(int frames);
    [PreserveSig] int GetNextPacketSize(out int frames);
  }

  const int N = 2048;
  static readonly float[] ring = new float[N];
  static int ringAt = 0;
  static volatile bool stop = false;
  public static string Error = null;
  public static int Switches = 0;

  static void Push(float v) { ring[ringAt] = v; ringAt = (ringAt + 1) % N; }

  // One open output: its level meter, and (while it is the one listened to) its loopback.
  class Output {
    public IAudioMeterInformation meter;
    public IMMDevice device;
    public IAudioClient client;
    public IAudioCaptureClient capture;
    public int channels, bytes, rate;
    public bool isFloat;

    public float Peak() { float p; return meter != null && meter.GetPeakValue(out p) == 0 ? p : 0f; }

    public bool Open() {
      Guid iidClient = new Guid("1CB9AD4C-DBFA-4c32-B178-C2F568A703B2");
      object o;
      if (device.Activate(ref iidClient, 23, IntPtr.Zero, out o) != 0) return false;
      client = (IAudioClient)o;
      IntPtr fmt;
      if (client.GetMixFormat(out fmt) != 0) return false;
      int tag = (ushort)Marshal.ReadInt16(fmt, 0);
      channels = Marshal.ReadInt16(fmt, 2);
      rate = Marshal.ReadInt32(fmt, 4);
      bytes = Marshal.ReadInt16(fmt, 14) / 8;
      isFloat = tag == 3 || (tag == 0xFFFE && Marshal.ReadInt32(fmt, 24) == 3);
      // 0x00020000: loopback, the sound this output is playing.
      int hr = client.Initialize(0, 0x00020000, 2000000, 0, fmt, IntPtr.Zero);
      Marshal.FreeCoTaskMem(fmt);
      if (hr != 0) return false;
      Guid iidCapture = new Guid("C8ADBD64-E71E-48a0-A4DE-185C395CD317");
      if (client.GetService(ref iidCapture, out o) != 0) return false;
      capture = (IAudioCaptureClient)o;
      return client.Start() == 0;
    }
    public void Close() {
      try { if (client != null) client.Stop(); } catch { }
      if (capture != null) Marshal.ReleaseComObject(capture);
      if (client != null) Marshal.ReleaseComObject(client);
      capture = null; client = null;
    }
    /** Moves whatever has been played since last time into the ring, as one channel. Returns frames read. */
    public int Read() {
      int total = 0, frames;
      while (capture.GetNextPacketSize(out frames) == 0 && frames > 0) {
        IntPtr data; int flags; long a, b;
        if (capture.GetBuffer(out data, out frames, out flags, out a, out b) != 0) break;
        bool silent = (flags & 2) != 0;
        int stride = channels * bytes;
        for (int i = 0; i < frames; i++) {
          float v = 0f;
          if (!silent) {
            for (int c = 0; c < channels; c++) {
              int at = i * stride + c * bytes;
              if (isFloat && bytes == 4) v += BitConverter.ToSingle(BitConverter.GetBytes(Marshal.ReadInt32(data, at)), 0);
              else if (bytes == 2) v += Marshal.ReadInt16(data, at) / 32768f;
              else if (bytes == 4) v += Marshal.ReadInt32(data, at) / 2147483648f;
              else if (bytes == 3) v += ((Marshal.ReadByte(data, at) | (Marshal.ReadByte(data, at + 1) << 8) | ((sbyte)Marshal.ReadByte(data, at + 2) << 16))) / 8388608f;
            }
            v /= channels;
          }
          Push(v);
        }
        capture.ReleaseBuffer(frames);
        total += frames;
      }
      return total;
    }
  }

  static void Fft(double[] re, double[] im) {
    int n = re.Length;
    for (int i = 1, j = 0; i < n; i++) {
      int bit = n >> 1;
      for (; (j & bit) != 0; bit >>= 1) j ^= bit;
      j ^= bit;
      if (i < j) { double t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; }
    }
    for (int len = 2; len <= n; len <<= 1) {
      double ang = -2 * Math.PI / len, wr = Math.Cos(ang), wi = Math.Sin(ang);
      for (int i = 0; i < n; i += len) {
        double cr = 1, ci = 0;
        for (int k = 0; k < len / 2; k++) {
          int a = i + k, b = i + k + len / 2;
          double xr = re[b] * cr - im[b] * ci, xi = re[b] * ci + im[b] * cr;
          re[b] = re[a] - xr; im[b] = im[a] - xi; re[a] += xr; im[a] += xi;
          double nr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = nr;
        }
      }
    }
  }

  static string Bands(int rate) {
    double[] re = new double[N], im = new double[N];
    for (int i = 0; i < N; i++) re[i] = ring[(ringAt + i) % N] * (0.5 - 0.5 * Math.Cos(2 * Math.PI * i / (N - 1)));
    Fft(re, im);
    StringBuilder line = new StringBuilder("B");
    double nyquist = rate / 2.0;
    for (int b = 0; b < 16; b++) {
      double f0 = 32 * Math.Pow(14000 / 32.0, b / 16.0), f1 = 32 * Math.Pow(14000 / 32.0, (b + 1) / 16.0);
      int from = Math.Max(1, (int)Math.Floor(f0 / nyquist * (N / 2)));
      int to = Math.Max(from + 1, (int)Math.Ceiling(f1 / nyquist * (N / 2)));
      double peak = 0;
      for (int k = from; k < to && k < N / 2; k++) peak = Math.Max(peak, Math.Sqrt(re[k] * re[k] + im[k] * im[k]) / N * 4);
      double db = 20 * Math.Log10(Math.Max(peak, 1e-9));
      double v = Math.Min(1, Math.Max(0, (db + 100) / 90));
      line.Append(' ').Append(v.ToString("0.###", CultureInfo.InvariantCulture));
    }
    return line.ToString();
  }

  static void Run() {
    try {
      IMMDeviceEnumerator enumerator = (IMMDeviceEnumerator)(new MMDeviceEnumerator());
      IMMDeviceCollection all;
      enumerator.EnumAudioEndpoints(0, 1, out all);        // outputs that are active
      int count; all.GetCount(out count);
      List<Output> outputs = new List<Output>();
      Guid iidMeter = new Guid("C02216F6-8C67-4B5B-9D00-D008E73E0064");
      for (int i = 0; i < count; i++) {
        IMMDevice d; object o;
        if (all.Item(i, out d) != 0) continue;
        Output output = new Output(); output.device = d;
        if (d.Activate(ref iidMeter, 23, IntPtr.Zero, out o) == 0) output.meter = (IAudioMeterInformation)o;
        outputs.Add(output);
      }
      if (outputs.Count == 0) { Error = "no active sound output"; return; }

      Output current = null;
      DateTime lastPick = DateTime.MinValue, lastLine = DateTime.MinValue, lastSound = DateTime.UtcNow;
      while (!stop) {
        DateTime now = DateTime.UtcNow;
        // Every second: which output carries the most sound? Move only for a clear winner.
        if ((now - lastPick).TotalMilliseconds > 1000) {
          lastPick = now;
          Output best = null; float bestPeak = 0f;
          foreach (Output o in outputs) { float p = o.Peak(); if (p > bestPeak) { bestPeak = p; best = o; } }
          float mine = current != null ? current.Peak() : 0f;
          if (best != null && best != current && bestPeak > 0.002f && (current == null || bestPeak > mine * 3f + 0.002f)) {
            if (current != null) current.Close();
            current = best.Open() ? best : null;
            if (current == null) best.Close(); else Switches++;
          }
        }
        if (current != null) {
          if (current.Read() > 0) lastSound = now;
          else if ((now - lastSound).TotalMilliseconds > 120) { for (int i = 0; i < 400; i++) Push(0f); }   // nothing playing: let it fall silent
        }
        // A line about 30 times a second, silence included, so the widget knows it is being heard for.
        if ((now - lastLine).TotalMilliseconds >= 32) {
          lastLine = now;
          Console.Out.WriteLine(current != null ? Bands(current.rate) : "B 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0");
          Console.Out.Flush();
        }
        Thread.Sleep(8);
      }
      if (current != null) current.Close();
    } catch (Exception e) { Error = e.Message; }
  }

  public static void Start() {
    Thread t = new Thread(Run);
    t.IsBackground = true;
    t.SetApartmentState(ApartmentState.MTA);
    t.Start();
  }
  public static void Stop() { stop = true; }
}
'@

[SoundLoop]::Start()
$stdin = New-Object System.IO.StreamReader([Console]::OpenStandardInput())
$pending = $stdin.ReadLineAsync()
$began = Get-Date
while ($true) {
  if ($pending.Wait(250)) {
    if ($null -eq $pending.Result) { break }
    $pending = $stdin.ReadLineAsync()
  }
  if ([SoundLoop]::Error) { [Console]::Error.WriteLine('sound: ' + [SoundLoop]::Error); break }
  if ($Seconds -gt 0 -and ((Get-Date) - $began).TotalSeconds -ge $Seconds) { break }
}
[SoundLoop]::Stop()
Start-Sleep -Milliseconds 60
