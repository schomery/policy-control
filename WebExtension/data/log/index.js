'use strict';

var tabId = window.location.search.replace('?tabId=', '');

if (tabId) {
  tabId = Number(tabId);
}
else {
  window.alert('Cannot find tabId argument in the URL!');
}

chrome.runtime.sendMessage({
  method: 'get-info',
  tabId
}, response => {
  if (response.tab) {
    document.getElementById('url').textContent = response.tab.hostname;
  }

  const template = document.querySelector('template');
  const tbody = document.querySelector('tbody');
  response.blocked.forEach(o => {
    const clone = document.importNode(template.content, true);

    if (['sub_frame', 'stylesheet', 'script', 'image', 'font', 'object', 'xmlhttprequest', 'ping', 'csp_report', 'media', 'websocket'].indexOf(o.type) === -1) {
      o.type = 'other';
    }

    clone.querySelector('td:nth-child(1)').textContent = o.type;
    clone.querySelector('td:nth-child(2)').textContent = o.url;
    const tr = clone.querySelector('tr');
    Object.assign(tr.dataset, o);
    tbody.appendChild(clone);
  });
});

document.addEventListener('click', ({target}) => {
  const cmd = target.dataset.cmd;
  if (cmd === 'add') {
    const tr = target.closest('tr');
    const o = tr.dataset;
    const uri = new URL(o.url);
    if (window.confirm(`Globally allow "${o.type}" type requests for "${uri.origin}" origin?`)) {
      const type = 'bypass.' + o.type;
      chrome.storage.local.get({
        [type]: []
      }, prefs => {
        prefs[type].push(uri.origin);
        prefs[type] = prefs[type].filter((s, i, l) => l.indexOf(s) === i);
        chrome.storage.local.set({
          [type]: prefs[type]
        }, () => {
          [...document.querySelectorAll('tr')].filter(tr => tr.dataset.type === o.type).forEach(tr => {
            if (tr.dataset.url.startsWith(uri.origin)) {
              tr.parentNode.removeChild(tr);
            }
          });
          tr.parentNode.removeChild(tr);
        });
      });
    }
  }
});
