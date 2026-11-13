# jusic

A local music player for the files on your own machine. It runs a tiny web
server on your PC, reads the tags out of your audio files, and serves a player
in the browser. Nothing is uploaded anywhere — the server only listens on
`127.0.0.1`, so it is reachable from this computer and nowhere else.

## Running it

Double-click **jusic** on your desktop. It opens in its own window — no tabs, no
address bar — and quits when you close that window. There is no console window
and nothing runs in the background once you are done.

Under the hood the shortcut runs `node server.js --app`, which starts the server
hidden and opens Chrome or Edge in app mode pointed at it. The server keeps a
live connection to the page, so when the last window closes it shuts itself
down about ten seconds later. There is also a **Quit jusic** button at the
bottom of the sidebar.

### Other ways to start it

```bash
npm start          # normal browser tab, console window visible
npm run app        # desktop-app window, same as the shortcut
```

To point it at a different folder, or to use another port:

```bash
node server.js "D:/path/to/music" --port 5180
```

There are no dependencies to install. Node 18 or newer is the only requirement.

### Shortcuts

`npm run shortcut` creates the desktop and Start Menu entries; run it again if
you move this folder. `npm run unshortcut` removes them. The icon is generated
by `npm run icons`, which draws it from scratch and writes `jusic.ico` plus the
PNGs the browser uses for the window and taskbar.

## Using it

Click any track to play it. The left rail switches between your whole library,
favorites, recently played, most played, eras, sessions and your own playlists.
The panel on the right shows what is playing, a spectrum display, file details,
and the up-next queue — drag queue entries to reorder them.

Right-click a track (or use the **···** button) for play next, add to queue,
add to a playlist, set its era, jump to its era or session, reveal the file in
Explorer, or save a copy.

### Eras

Every track carries the chapter it comes from — *JW3*, *WRLD ON DRUGS*,
*Outsiders* and the rest — in its own column, tinted with the colour of that
era's cover. Click a chip to open that era; **Eras** in the sidebar lays them
all out oldest to newest. The column header sorts by era, so the library reads
as a timeline.

Eras are worked out from the album tag, the abbreviations in filenames
(`(WOD)`, `(GB&GR)`, `(JUTE)`), and, for untagged leaks, from other copies of
the same song that *are* tagged. Anything still unknown shows **Set era** when
you hover the row. Pick from the list, press its number, or type a name to
invent an era of your own — and your choice always wins over the guess. `E`
sets the era of whatever is playing.

### Equalizer

Ten bands, a preamp, and eight presets, at the bottom of **Settings** or
straight from the slider button in the playbar (`.`). Drag a band, scroll on
it, or use the arrow keys; double-click to zero it. The curve above the faders
shows what you are doing, with the music's own spectrum drifting behind it.

It sits before the visualizer, so the bars show the sound as it actually leaves
the app. The switch bypasses everything without losing your curve, and boosting
a lot of bands can clip — pull the preamp down a couple of dB when it does.

### Audio output

**Settings** at the bottom of the sidebar (or `,`) picks which speakers or
headphones jusic plays through; other apps keep using whatever Windows is set
to. The first time, press **Show my devices**: the window asks for microphone
access, because that's the permission browsers use to reveal device names.
Nothing is recorded and the mic is released immediately. Your choice is
remembered, and if that device is unplugged jusic falls back to the default,
then switches back when it returns.

### Keyboard

| Key | Action | | Key | Action |
|---|---|---|---|---|
| `Space` | Play / pause | | `S` | Toggle shuffle |
| `←` `→` | Seek 5 seconds | | `R` | Cycle repeat off / all / one |
| `Shift`+`←` `→` | Previous / next track | | `F` | Favorite what's playing |
| `↑` `↓` | Volume | | `M` | Mute |
| `/` | Jump to search | | `Q` | Show the queue |
| `Esc` | Clear search, close dialogs | | `?` | Shortcut list |
| `,` | Settings | | `.` | Equalizer |
| `E` | Set the era of what's playing | | | |

Media keys on your keyboard work too, and Windows shows the track in its volume
overlay.

## What it does with your files

It **only ever reads** them. Your music folder is never written to.

On first run it scans the folder and reads each file's header: ID3 tags, the
embedded cover, and the duration from the audio bitstream. Results are cached in
`data/`, so later starts are instant and only changed files are re-read.

The archive this was built for has more information in its filenames than in its
tags, so filenames are parsed too. `Ignorant (Killing My Vibe) (Bigger And
Better) (V2) (WOD).mp3` becomes the title *Ignorant*, alternate names *Killing
My Vibe* and *Bigger And Better*, version *V2*, and the *WRLD ON DRUGS* era. Featured artists, session notes and tempo markers are picked out the
same way.

Files that are byte-identical copies of each other (`Track.mp3` and
`Track - Copy.mp3`) are detected and hidden behind the grid toggle in the
toolbar, so the library reads cleanly without anything being deleted.

Covers embedded in MP3s here average about 650 KB, which is far too heavy for a
scrolling list. The first time you run it, the browser quietly downsamples each
one to a 12 KB thumbnail and hands it back to the server to cache. That pass
also samples the palette that tints the whole interface to match whatever is
playing.

## Files

| Path | What it is |
|---|---|
| `server.js` | HTTP server: library API, range-streamed audio, artwork |
| `lib/id3.js` | ID3v2.2/2.3/2.4 and ID3v1 tag reader |
| `lib/audio.js` | Duration and bitrate from MP3, MP4/M4A, FLAC and WAV headers |
| `lib/titles.js` | Filename parser |
| `lib/library.js` | Scanner and cache |
| `public/` | The player itself (no build step, no framework) |
| `tools/` | Icon generator and the shortcut installer |
| `data/` | Generated cache: index, artwork, thumbnails, your settings |
| `config.json` | Music folder, port |

Your favorites, playlists, play counts, era choices, equalizer curve and
settings live in `data/state.json`.
Deleting `data/` loses those but nothing else — the next start rebuilds the
library from your files.

`data/window` is the browser profile the app window uses. Keeping it separate
from your normal browsing means jusic gets its own taskbar entry and remembers
its own window size, at the cost of roughly 120 MB. Delete it any time; it is
rebuilt on the next launch, and the window simply reverts to its default size.
`data/jusic.log` is where the hidden server writes its output — worth a look if
the app ever fails to start.

## If something looks wrong

**A track won't play.** Some files in a scraped archive carry the wrong
extension. The scanner detects the real container from its magic bytes and
serves the correct type, which handles most cases; anything the browser genuinely
cannot decode is skipped with a message.

**New files aren't showing up.** Click *Rescan library* at the bottom of the
sidebar.

**Titles parsed oddly.** The rules live in `lib/titles.js`. Adjust, then rescan.

**Port already in use.** jusic is probably already running — clicking the
shortcut again just opens another window against it. To run a second copy
anyway, start it with `--port 5176`.

**The shortcut does nothing.** Check `data/jusic.log`. The most likely cause is
that the folder moved, in which case `npm run shortcut` repoints it.

**It opened in a normal browser tab.** No Chrome or Edge was found at the usual
install paths, so it fell back to your default browser. Everything works the
same; only the window dressing differs.
