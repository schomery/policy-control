'use strict';

var dictionary = {
  0: 'Block all',
  1: 'Block third-party',
  2: 'Allow all',
  true: 'enabled',
  false: 'disabled'
};

var update = (hostname, ignore = false) => {
  const prefs = {
    'sub_frame': 2,
    'stylesheet': 2,
    'script': 1,
    'image': 2,
    'font': 2,
    'object': 1,
    'xmlhttprequest': 1,
    'ping': 0,
    'csp_report': 0,
    'media': 1,
    'websocket': 1,
    'other': 0
  };
  if (hostname) {
    prefs[hostname] = false;
  }
  chrome.storage.local.get(prefs, prefs => {
    if (ignore === false) {
      document.getElementById('hostname').checked = hostname && prefs[hostname];
    }

    const config = prefs[hostname] || prefs;
    [
      'sub_frame', 'stylesheet', 'script', 'image', 'font', 'object',
      'xmlhttprequest', 'ping', 'csp_report', 'media', 'websocket', 'other'
    ].forEach(key => {
      const input = document.getElementById(key);

      input.value = config[key];
      input.dispatchEvent(new Event('change', {
        bubbles: true
      }));
    });
  });
};

document.addEventListener('change', e => {
  const target = e.target;
  const tr = target.closest('tr');
  if (tr) {
    const state = tr.querySelector('.state');
    if (state) {
      state.textContent = dictionary[target.type === 'checkbox' ? target.checked : target.value];
    }
  }
  if (target.id === 'hostname') {
    update(target.checked ? document.body.dataset.hostname : '', true);
  }
  if (target.id === 'enabled') {
    chrome.storage.local.set({
      enabled: target.checked
    });
  }
});

chrome.storage.local.get({
  enabled: false
}, prefs => {
  document.getElementById('enabled').checked = prefs.enabled;
  document.getElementById('enabled').dispatchEvent(new Event('change', {
    bubbles: true
  }));
});

chrome.tabs.query({
  active: true,
  currentWindow: true
}, ([tab]) => {
  const {protocol, hostname} = new URL(tab.url);
  const perhost = protocol === 'http:' || protocol === 'https:' || protocol === 'ftp:';

  document.body.dataset.hostname = hostname;
  document.body.dataset.perhost = perhost;
  document.body.dataset.tabId = tab.id;
  document.getElementById('hn').textContent = hostname;

  update(hostname);
});

document.getElementById('save').addEventListener('click', () => {
  const {hostname} = document.body.dataset;
  const perhost = document.getElementById('hostname').checked;
  if (perhost === false) {
    chrome.storage.local.remove(hostname);
  }
  let prefs = {
    'sub_frame': Number(document.getElementById('sub_frame').value),
    'stylesheet': Number(document.getElementById('stylesheet').value),
    'script': Number(document.getElementById('script').value),
    'image': Number(document.getElementById('image').value),
    'font': Number(document.getElementById('font').value),
    'object': Number(document.getElementById('object').value),
    'xmlhttprequest': Number(document.getElementById('xmlhttprequest').value),
    'ping': Number(document.getElementById('ping').value),
    'csp_report': Number(document.getElementById('csp_report').value),
    'media': Number(document.getElementById('media').value),
    'websocket': Number(document.getElementById('websocket').value),
    'other': Number(document.getElementById('other').value),
  };
  if (perhost) {
    prefs = {
      [hostname]: prefs
    };
  }
  chrome.storage.local.set(prefs, () => {
    const info = document.getElementById('info');
    info.textContent = 'Saved';
    window.setTimeout(() => info.textContent = '', 750);
  });
});

document.getElementById('reset').addEventListener('click', () => {
  Object.entries({
    'sub_frame': 2,
    'stylesheet': 2,
    'script': 1,
    'image': 2,
    'font': 2,
    'object': 1,
    'xmlhttprequest': 1,
    'ping': 0,
    'csp_report': 0,
    'media': 1,
    'websocket': 1,
    'other': 0
  }).forEach(([key, value]) => {
    document.getElementById(key).value = value;
    document.getElementById(key).dispatchEvent(new Event('change', {
      bubbles: true
    }));
  });
});

document.getElementById('open-log').addEventListener('click', () => chrome.tabs.create({
  url: '/data/log/index.html?tabId=' + document.body.dataset.tabId
}));

document.getElementById('open-options').addEventListener('click', () => chrome.runtime.openOptionsPage());
document.getElementById('refresh').addEventListener('click', () => {
  const id = Number(document.body.dataset.tabId);
  chrome.tabs.reload(id);
});
