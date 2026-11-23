/** Settings dialog: where the sound comes out, and how it is shaped. */

import { h, icon, toast } from './util.js';
import { store, setSetting } from './store.js';
import { refreshLevel } from './player.js';
import { eqSection } from './eqpanel.js';
import { openModal, closeModal } from './ui.js';
import {
  outputSupported, refreshOutputs, outputs, outputsNamed, unlockOutputs, selectedOutput,
  chooseOutput, outputName, cleanLabel, playTestSound, onOutputsChange,
} from './output.js';

const HEADPHONES = /headphone|headset|earphone|earbud|buds|airpods|arctis|hyperx|kraken|wh-|wf-|bose|beats|jabra/i;

const fill = (node, ...children) => node.replaceChildren(...children.flat().filter(Boolean));

function pop(node) {
  node.classList.remove('is-pop');
  void node.offsetWidth;
  node.classList.add('is-pop');
}

/** A row with a switch: a name, a line about it, and anything extra (a slider) beside the switch. */
function switchRow(title, about, on, onChange, extra = null) {
  const button = h('button.switch', { role: 'switch', 'aria-label': title, 'aria-checked': String(on), class: on ? 'is-on' : '' }, h('i'));
  button.addEventListener('click', () => {
    const next = button.getAttribute('aria-checked') !== 'true';
    button.setAttribute('aria-checked', String(next));
    button.classList.toggle('is-on', next);
    onChange(next);
  });
  return h('div.setting-head', { style: { gridTemplateColumns: '1fr auto auto', alignItems: 'center', marginBottom: '10px' } },
    h('div', null, h('b', null, title), h('p', null, about)), extra, button);
}

/** How tracks follow each other, how loud they are, and whether the glass moves. */
function playbackSection() {
  const s = store.settings;
  const length = h('input', { type: 'range', min: 1, max: 12, step: 1, value: s.crossfade || s.crossfadeLength || 4, 'aria-label': 'Crossfade length in seconds', style: { width: '110px' } });
  const readout = h('span.num', { style: { width: '32px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' } });
  const paint = () => { readout.textContent = length.value + ' s'; };
  length.addEventListener('input', () => {
    paint();
    setSetting('crossfadeLength', Number(length.value));           // remembered while crossfade is off, too
    if (store.settings.crossfade) setSetting('crossfade', Number(length.value));
  });
  paint();
  return h('section.setting', null,
    switchRow('Crossfade', 'Each track fades in under the end of the one before it.', Boolean(s.crossfade),
      (on) => setSetting('crossfade', on ? Number(length.value) : 0), h('div', { style: { display: 'flex', gap: '8px', alignItems: 'center' } }, length, readout)),
    switchRow('Even out volume', 'Quiet tracks are brought up and loud ones down. Each track is measured the first time it plays; your files are never changed.', Boolean(s.normalize),
      (on) => { setSetting('normalize', on); refreshLevel(); }),
    switchRow('Reduce motion', 'Keeps the glass still: no swells, drifts or springs. Windows\' own setting is always respected as well.', Boolean(s.reduceMotion),
      (on) => { setSetting('reduceMotion', on); document.documentElement.classList.toggle('reduce-motion', on); }),
  );
}

/** @param {{focus?: 'output'|'eq'}} options Which section to open at. */
export async function openSettings({ focus = 'output' } = {}) {
  const outputBody = h('div');
  const equalizer = eqSection();
  const body = h('div.settings-body', null, outputBody, playbackSection(), equalizer);
  let blocked = false;

  openModal(
    h('h2', null, 'Settings'),
    h('p.sub', null, 'Changes apply straight away and are remembered next time.'),
    body,
    h('div.modal-actions', null, h('button.pill.pill--primary', { onclick: closeModal }, 'Done')),
  );
  if (focus === 'eq') {
    setTimeout(() => equalizer.scrollIntoView({ block: 'nearest', behavior: 'smooth' }), 60);
  }

  async function render() {
    if (outputSupported) {
      try { await refreshOutputs(); } catch { /* shown below as an empty list */ }
    }

    const section = h('section.setting', null,
      h('div.setting-head', null,
        h('span.setting-icon', null, icon('headphones')),
        h('div', null,
          h('b', null, 'Audio output'),
          h('p', null, 'Choose the speakers or headphones jusic plays through. Other apps are not affected.'),
        ),
      ),
    );

    if (!outputSupported) {
      section.append(h('div.notice', null, icon('warn'),
        h('div', null, 'This browser can’t switch outputs, so jusic uses your system default. The desktop shortcut opens it in Edge or Chrome, which can.')));
      fill(outputBody, section);
      return;
    }

    if (!outputsNamed()) {
      const allow = h('button.pill.pill--primary', null, icon('headphones'), h('span', null, 'Show my devices'));
      allow.addEventListener('click', async () => {
        allow.disabled = true;
        try {
          await unlockOutputs();
          blocked = false;
        } catch (err) {
          blocked = true;
          console.warn('device access refused', err);
        }
        render();
      });
      section.append(h('div.unlock', null,
        h('p', null,
          'Your browser only shares device names after you allow access once. It will ask about the ',
          h('b', null, 'microphone'),
          ': that’s the permission that covers audio devices. jusic never records anything, and it switches the mic off the moment the list loads.'),
        blocked
          ? h('div.notice.notice--danger', null, icon('warn'), h('div', null,
            'Access was blocked, so only the system default is available. To allow it, click the site controls (the icon beside the window title or in the ··· menu), set Microphone to Allow, then try again.'))
          : null,
        h('div.setting-row', null,
          allow,
          h('button.pill', { onclick: () => test('') }, icon('vol'), h('span', null, 'Test default')),
        ),
      ));
      fill(outputBody, section);
      return;
    }

    const current = selectedOutput();
    const list = outputs();
    const rows = list.map((d) => {
      const id = d.deviceId === 'default' ? '' : d.deviceId;
      const on = id === current;
      const label = d.deviceId === 'default' ? 'System default' : cleanLabel(d.label);
      const underlying = cleanLabel(d.label.replace(/^Default\s*-\s*/i, ''));
      const sub = d.deviceId === 'default'
        ? (underlying ? `Follows Windows · now ${underlying}` : 'Follows Windows')
        : 'Always use this device';
      const iconName = HEADPHONES.test(d.label) ? 'headphones' : 'vol';

      const row = h('button.device', { class: on ? 'is-on' : '', role: 'radio', 'aria-checked': String(on) },
        h('span.device-icon', null, icon(iconName)),
        h('span.device-text', null, h('b', null, label), h('em', null, sub)),
        h('span.device-check', null, on ? icon('check') : null),
      );
      row.addEventListener('click', async () => {
        if (on) { pop(row); return; }
        try {
          await chooseOutput(id);
          toast(`Playing through ${outputName(id)}`, iconName);
          render();
        } catch (err) {
          toast(`Couldn’t switch to ${label}: ${err.message}`, 'warn');
        }
      });
      return row;
    });

    const savedMissing = current && !list.some((d) => d.deviceId === current);

    section.append(...[
      savedMissing
        ? h('div.notice', { style: { marginBottom: '10px' } }, icon('warn'), h('div', null,
          `${outputName(current)} isn’t connected, so sound is going to the system default. It switches back automatically when you plug it in.`))
        : null,
      h('div.devices', { role: 'radiogroup', 'aria-label': 'Audio output' }, rows),
      h('div.setting-foot', null,
        h('button.pill.pill--sm', { onclick: () => test(current) }, icon('vol'), h('span', null, 'Play test sound')),
        h('button.link-btn', { onclick: render }, 'Refresh list'),
      ),
    ].filter(Boolean));
    fill(outputBody, section);
  }

  async function test(id) {
    try {
      await playTestSound(id);
    } catch (err) {
      toast(`Test sound failed: ${err.message}`, 'warn');
    }
  }

  // Follow plugs and unplugs while the dialog is open; stop once it's gone.
  const off = onOutputsChange(() => {
    if (body.isConnected) render();
    else off();
  });
  await render();
}
