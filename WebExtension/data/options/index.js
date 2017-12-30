/* globals prefs */
'use strict';

var restore = () => chrome.storage.local.get({
  'bypass.sub_frame': [],
  'bypass.stylesheet': [],
  'bypass.script': [],
  'bypass.image': [],
  'bypass.font': [],
  'bypass.object': [],
  'bypass.xmlhttprequest': ['https://*.googlevideo.com'],
  'bypass.ping': [],
  'bypass.csp_report': [],
  'bypass.media': [],
  'bypass.websocket': [],
  'bypass.other': [],
}, prefs => Object.entries(prefs).forEach(([key, value]) => document.getElementById(key).value = value.join(', ')));

document.addEventListener('DOMContentLoaded', restore);

chrome.storage.local.get({
  'auto': false
}, prefs => Object.entries(prefs).forEach(([key, value]) => document.getElementById(key).checked = value));

function cleanup(obj, o2) {
  const tmp = {};
  Object.entries(obj).forEach(([key, value]) => {
    tmp[key] = value.split(/\s*,\s*/).map(s => s.trim())
      .filter(s => s.startsWith('http') || s.startsWith('ftp') || s.startsWith('wss') || s.startsWith('r:'))
      .filter((s, i, l) => s && l.indexOf(s) === i);
  });
  return Object.assign(tmp, o2);
}

document.getElementById('save').addEventListener('click', () => chrome.storage.local.set(cleanup({
  'bypass.sub_frame': document.getElementById('bypass.sub_frame').value,
  'bypass.stylesheet': document.getElementById('bypass.stylesheet').value,
  'bypass.script': document.getElementById('bypass.script').value,
  'bypass.image': document.getElementById('bypass.image').value,
  'bypass.font': document.getElementById('bypass.font').value,
  'bypass.object': document.getElementById('bypass.object').value,
  'bypass.xmlhttprequest': document.getElementById('bypass.xmlhttprequest').value,
  'bypass.ping': document.getElementById('bypass.ping').value,
  'bypass.csp_report': document.getElementById('bypass.csp_report').value,
  'bypass.media': document.getElementById('bypass.media').value,
  'bypass.websocket': document.getElementById('bypass.websocket').value,
  'bypass.other': document.getElementById('bypass.other').value,
}, {
  'auto': document.getElementById('auto').checked,
}), () => {
  const info = document.getElementById('info');
  info.textContent = 'Options saved';
  restore();
  window.setTimeout(() => info.textContent = '', 750);
}));

document.getElementById('export').addEventListener('click', () => chrome.storage.local.get(null, prefs => {
  delete prefs.version;
  delete prefs.enabled;

  const text = JSON.stringify(prefs, null, '\t');
  const url = 'data:text/plain;charset=utf-8,' + encodeURIComponent(text);

  fetch(url)
    .then(res => res.blob())
    .then(blob => {
      const objectURL = URL.createObjectURL(blob);
      const link = Object.assign(document.createElement('a'), {
        href: objectURL,
        type: 'application/json',
        download: 'policy-control-settings.json',
      });
      link.dispatchEvent(new MouseEvent('click'));
      setTimeout(() => URL.revokeObjectURL(objectURL));
    });
}));

document.getElementById('import').addEventListener('click', () => {
  const input = Object.assign(document.createElement('input'), {
    type: 'file',
    onchange: function() {
      const file = this.files[0];
      const reader = new FileReader();
      reader.onloadend = event => {
        input.remove();
        chrome.storage.local.get(null, prefs => {
          Object.assign(prefs, JSON.parse(event.target.result));
          chrome.storage.local.set(prefs, () => window.location.reload());
        });
      };
      reader.readAsText(file, 'utf-8');
    }
  });
  input.click();
});

document.getElementById('support').addEventListener('click', () => chrome.tabs.create({
  url: chrome.runtime.getManifest().homepage_url + '?rd=donate'
}));
