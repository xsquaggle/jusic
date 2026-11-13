'use strict';
/**
 * Duration and bitrate estimation straight from the bitstream.
 * MP3: first frame header + Xing/Info/VBRI when present, CBR extrapolation otherwise.
 * WAV: the fmt / data chunk pair.
 */

const BITRATES = {
  // [version][layer] -> table indexed by the 4-bit bitrate index
  '1-1': [0, 32, 64, 96, 128, 160, 192, 224, 256, 288, 320, 352, 384, 416, 448],
  '1-2': [0, 32, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 384],
  '1-3': [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320],
  '2-1': [0, 32, 48, 56, 64, 80, 96, 112, 128, 144, 160, 176, 192, 224, 256],
  '2-2': [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160],
  '2-3': [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160],
};
const SAMPLE_RATES = { 1: [44100, 48000, 32000], 2: [22050, 24000, 16000], 2.5: [11025, 12000, 8000] };

/** Decode an MPEG audio frame header at `off`, or null if it is not a valid one. */
function parseFrameHeader(buf, off) {
  if (off + 4 > buf.length) return null;
  if (buf[off] !== 0xff || (buf[off + 1] & 0xe0) !== 0xe0) return null;

  const versionBits = (buf[off + 1] >> 3) & 0x03;
  const layerBits = (buf[off + 1] >> 1) & 0x03;
  if (versionBits === 1 || layerBits === 0) return null; // reserved

  const version = versionBits === 3 ? 1 : versionBits === 2 ? 2 : 2.5;
  const layer = 4 - layerBits; // 3 -> Layer I, 2 -> Layer II, 1 -> Layer III
  const bitrateIndex = (buf[off + 2] >> 4) & 0x0f;
  const rateIndex = (buf[off + 2] >> 2) & 0x03;
  if (bitrateIndex === 0 || bitrateIndex === 15 || rateIndex === 3) return null;

  const table = BITRATES[(version === 1 ? '1' : '2') + '-' + layer];
  const bitrate = table[bitrateIndex] * 1000;
  const sampleRate = SAMPLE_RATES[version][rateIndex];
  const padding = (buf[off + 2] >> 1) & 1;
  const channelMode = (buf[off + 3] >> 6) & 0x03;
  const channels = channelMode === 3 ? 1 : 2;

  const samplesPerFrame = layer === 1 ? 384 : (layer === 3 || version === 1) ? 1152 : 576;
  const frameLength = layer === 1
    ? Math.floor((12 * bitrate / sampleRate + padding) * 4)
    : Math.floor(samplesPerFrame / 8 * bitrate / sampleRate) + padding;

  if (frameLength < 8) return null;
  return { version, layer, bitrate, sampleRate, channels, channelMode, samplesPerFrame, frameLength };
}

/** Scan forward for a frame header that is corroborated by a second one right after it. */
function findFirstFrame(buf, start) {
  const limit = Math.min(buf.length - 4, start + 200000);
  for (let i = start; i < limit; i++) {
    if (buf[i] !== 0xff) continue;
    const h = parseFrameHeader(buf, i);
    if (!h) continue;
    const next = parseFrameHeader(buf, i + h.frameLength);
    if (next && next.sampleRate === h.sampleRate && next.version === h.version) {
      return { offset: i, header: h };
    }
  }
  return null;
}

/** Read a Xing/Info or VBRI header out of the first frame, if one is there. */
function readVbrHeader(buf, frameOffset, h) {
  let sideInfo;
  if (h.version === 1) sideInfo = h.channelMode === 3 ? 17 : 32;
  else sideInfo = h.channelMode === 3 ? 9 : 17;

  const xingAt = frameOffset + 4 + sideInfo;
  if (xingAt + 16 <= buf.length) {
    const tag = buf.toString('latin1', xingAt, xingAt + 4);
    if (tag === 'Xing' || tag === 'Info') {
      const flags = buf.readUInt32BE(xingAt + 4);
      let p = xingAt + 8;
      let frames = null, bytes = null;
      if (flags & 0x0001) { frames = buf.readUInt32BE(p); p += 4; }
      if (flags & 0x0002) { bytes = buf.readUInt32BE(p); p += 4; }
      if (frames > 0) return { frames, bytes, vbr: tag === 'Xing' };
    }
  }

  const vbriAt = frameOffset + 4 + 32;
  if (vbriAt + 26 <= buf.length && buf.toString('latin1', vbriAt, vbriAt + 4) === 'VBRI') {
    const bytes = buf.readUInt32BE(vbriAt + 10);
    const frames = buf.readUInt32BE(vbriAt + 14);
    if (frames > 0) return { frames, bytes, vbr: true };
  }
  return null;
}

/**
 * @param {Buffer} head Leading bytes of the file (a few hundred KB is plenty).
 * @param {number} audioStart Byte offset where audio begins (after any ID3v2 tag).
 * @param {number} audioBytes Size of the audio payload, tags excluded.
 * @returns {?{duration: number, bitrate: number, sampleRate: number, channels: number, vbr: boolean, codec: string}}
 */
function probeMp3(head, audioStart, audioBytes) {
  const found = findFirstFrame(head, audioStart);
  if (!found) return null;
  const h = found.header;
  const vbrInfo = readVbrHeader(head, found.offset, h);

  let duration, bitrate, vbr = false;
  if (vbrInfo) {
    duration = vbrInfo.frames * h.samplesPerFrame / h.sampleRate;
    const dataBytes = vbrInfo.bytes || audioBytes;
    bitrate = duration > 0 ? Math.round(dataBytes * 8 / duration) : h.bitrate;
    vbr = vbrInfo.vbr;
  } else {
    bitrate = h.bitrate;
    duration = audioBytes * 8 / h.bitrate;
  }

  if (!isFinite(duration) || duration <= 0) return null;
  return {
    duration: Math.round(duration * 10) / 10,
    bitrate: Math.round(bitrate / 1000),
    sampleRate: h.sampleRate,
    channels: h.channels,
    vbr,
    codec: 'MPEG-' + (h.version === 2.5 ? '2.5' : h.version) + ' Layer ' + ['I', 'II', 'III'][h.layer - 1],
  };
}

/** Walk the RIFF chunk list for fmt/data. */
function probeWav(head, fileSize) {
  if (head.length < 44 || head.toString('latin1', 0, 4) !== 'RIFF') return null;
  if (head.toString('latin1', 8, 12) !== 'WAVE') return null;

  let pos = 12;
  let fmt = null, dataSize = null;
  while (pos + 8 <= head.length) {
    const id = head.toString('latin1', pos, pos + 4);
    const size = head.readUInt32LE(pos + 4);
    if (id === 'fmt ' && pos + 8 + 16 <= head.length) {
      fmt = {
        channels: head.readUInt16LE(pos + 10),
        sampleRate: head.readUInt32LE(pos + 12),
        byteRate: head.readUInt32LE(pos + 16),
        bits: head.readUInt16LE(pos + 22),
      };
    } else if (id === 'data') {
      // A streamed WAV can declare size 0 or 0xFFFFFFFF; fall back to the real length.
      dataSize = (size > 0 && pos + 8 + size <= fileSize) ? size : fileSize - (pos + 8);
      break;
    }
    if (size <= 0) break;
    pos += 8 + size + (size % 2);
  }

  if (!fmt || !fmt.byteRate || dataSize == null) return null;
  const duration = dataSize / fmt.byteRate;
  return {
    duration: Math.round(duration * 10) / 10,
    bitrate: Math.round(fmt.byteRate * 8 / 1000),
    sampleRate: fmt.sampleRate,
    channels: fmt.channels,
    vbr: false,
    codec: 'PCM ' + fmt.bits + '-bit',
  };
}

/**
 * MP4/M4A duration from the `mvhd` atom.
 * The atom is located by signature scan rather than by walking the tree, so it
 * works whether `moov` sits at the front or the back of the file.
 */
function probeM4a(buf) {
  const at = buf.indexOf('mvhd', 0, 'latin1');
  if (at === -1 || at + 32 > buf.length) return null;

  const version = buf[at + 4];
  let timescale, units;
  if (version === 1) {
    if (at + 36 > buf.length) return null;
    timescale = buf.readUInt32BE(at + 24);
    units = Number(buf.readBigUInt64BE(at + 28));
  } else {
    timescale = buf.readUInt32BE(at + 16);
    units = buf.readUInt32BE(at + 20);
  }
  if (!timescale || !units) return null;

  const duration = units / timescale;
  if (!isFinite(duration) || duration <= 0 || duration > 86400) return null;
  return {
    duration: Math.round(duration * 10) / 10,
    bitrate: null,
    sampleRate: null,
    channels: null,
    vbr: false,
    codec: 'MPEG-4 Audio',
  };
}

/** FLAC duration from the STREAMINFO block. */
function probeFlac(buf) {
  if (buf.length < 42 || buf.toString('latin1', 0, 4) !== 'fLaC') return null;
  const b = buf.subarray(8); // skip marker + STREAMINFO block header
  const sampleRate = (b[10] << 12) | (b[11] << 4) | (b[12] >> 4);
  const channels = ((b[12] >> 1) & 0x07) + 1;
  const bits = (((b[12] & 1) << 4) | (b[13] >> 4)) + 1;
  const samples = ((b[13] & 0x0f) * 2 ** 32) + b.readUInt32BE(14);
  if (!sampleRate || !samples) return null;
  const duration = samples / sampleRate;
  return {
    duration: Math.round(duration * 10) / 10,
    bitrate: null,
    sampleRate,
    channels,
    vbr: true,
    codec: 'FLAC ' + bits + '-bit',
  };
}

/**
 * Identify the real container from magic bytes. Files in a scraped archive are
 * routinely named `.mp3` while holding something else entirely.
 * @returns {?{container: string, mime: string}}
 */
function sniffContainer(head) {
  if (head.length < 12) return null;
  const ascii = (a, b) => head.toString('latin1', a, b);
  if (ascii(4, 8) === 'ftyp') {
    const brand = ascii(8, 12);
    if (brand.startsWith('qt')) return { container: 'mov', mime: 'video/quicktime' };
    return { container: 'm4a', mime: 'audio/mp4' };
  }
  if (ascii(0, 4) === 'fLaC') return { container: 'flac', mime: 'audio/flac' };
  if (ascii(0, 4) === 'OggS') return { container: 'ogg', mime: 'audio/ogg' };
  if (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WAVE') return { container: 'wav', mime: 'audio/wav' };
  if (ascii(0, 3) === 'ID3') return { container: 'mp3', mime: 'audio/mpeg' };
  if (head[0] === 0xff && (head[1] & 0xe0) === 0xe0) return { container: 'mp3', mime: 'audio/mpeg' };
  return null;
}

module.exports = { probeMp3, probeWav, probeM4a, probeFlac, sniffContainer };
