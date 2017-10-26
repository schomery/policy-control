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
      .filter(s => s.startsWith('http') || s.startsWith('ftp'))
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
