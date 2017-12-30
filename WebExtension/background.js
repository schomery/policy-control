'use strict';

var tabs = {};
chrome.tabs.onRemoved.addListener(tabId => delete tabs[tabId]);

var prefs = {
  'enabled': false,

  'sub_frame': 2, // 0: block, 1: block on third-party, 2: allow
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
  'other': 2,

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
};

var log = function() {
  console.log(...arguments);
};

var filter = (d, callback) => {
  // do not block background requests
  if (d.tabId === -1) {
    //log('[filter][allowed]', d.type, d.url, 'background request');
    return false;
  }
  // do not block "main_frame" requests
  if (d.type === 'main_frame') {
    chrome.browserAction.setBadgeText({
      text: '',
      tabId: d.tabId
    });

    const {origin, hostname, scheme} = new URL(d.url);
    tabs[d.tabId] = {
      origin,
      hostname,
      scheme,
      blocked: []
    };
    //log('[allowed]', d.type, d.url, 'main_frame request', 'module.filter');
    return false;
  }
  return callback(d);
};

var wildCompare = (string, search) => {
  let startIndex = 0;
  const array = search.split('*');
  for (var i = 0; i < array.length; i += 1) {
    const index = string.indexOf(array[i], startIndex);
    if (index === -1) {
      return false;
    }
    else {
      startIndex = index;
    }
  }
  return true;
};

var bypass = d => {
  const type = 'bypass.' + d.type;
  const list = type in prefs ? prefs[type] : prefs['bypass.other'];
  return list.some(origin => {
    if (origin.startsWith('r:')) {
      return (new RegExp(origin.substr(2))).test(d.url);
    }
    else if (origin.indexOf('*') === -1) {
      return d.url.startsWith(origin);
    }
    else {
      return wildCompare(d.url, origin);
    }
  });
};

var push = d => {
  if (bypass(d) === false) {
    const {tabId, url, type} = d;
    if (tabs[tabId]) {
      tabs[tabId].blocked.push({url, type});
      chrome.browserAction.setBadgeText({
        text: String(tabs[tabId].blocked.length),
        tabId: d.tabId
      });
    }
    return true;
  }
  else {
    //log('[allowed]', d.type, d.url, 'origin is in the bypass list', 'module.bypass');
    return false;
  }
};

var block = d => {
  const rules = tabs[d.tabId] ? prefs[tabs[d.tabId].hostname] || prefs : prefs;
  // use "other" type if d.type is not supported
  switch (d.type in rules ? rules[d.type] : rules.other) {
    case 0:
      //log('[blocked]', d.type, d.url, 'request rule is 0', 'module.block');
      return push(d);
    case 1: {
      if (tabs[d.tabId]) {
        let rtn = !d.url.startsWith(tabs[d.tabId].origin);
        rtn = rtn && d.url.indexOf('.' + tabs[d.tabId].hostname + '/') === -1;
        // log(`[${rtn ? 'blocked' : 'allowed'}]`, d.type, d.url, 'request rule is 1 and origin is ' + tabs[d.tabId].origin, 'module.block');
        return rtn && push(d);
      }
      else {
        // do not allow a request when main_frame is not loaded
        //log('[blocked]', d.type, d.url, 'request occurs before main_frame is emitted', 'module.block');
        return true;
      }
    }
    case 2: {
      //log('[allowed]', d.type, d.url, 'request rule is 2', 'module.block');
      return false;
    }
    // other resources
    default:
      console.error('default is not supposed to be called', d);
      return false;
  }
};

var observe = d => ({
  cancel: filter(d, block)
});
var install = () => {
  if (prefs.enabled) {
    chrome.webRequest.onBeforeRequest.addListener(observe, {
      urls: ['*://*/*']
    },
    ['blocking']);
  }
  else {
    chrome.webRequest.onBeforeRequest.removeListener(observe);
  }
  chrome.browserAction.setBadgeText({
    text: prefs.enabled ? '' : 'd'
  });
  chrome.browserAction.setTitle({
    title: 'Policy Control (' + (prefs.enabled ? 'enabled' : 'disabled') + ')'
  });
};

// communications
chrome.runtime.onMessage.addListener((request, sender, response) => {
  if (request.method === 'get-info') {
    response({
      blocked: tabs[request.tabId] ? tabs[request.tabId].blocked : [],
      tab: tabs[request.tabId]
    });
  }
});

// prefs
chrome.storage.local.get(null, ps => {
  Object.assign(prefs, ps);
  if (ps.auto && ps.enabled === false) {
    chrome.storage.local.set({
      enabled: true
    });
  }
  else {
    install();
  }
});
chrome.storage.onChanged.addListener(ps => {
  Object.keys(ps).forEach(key => prefs[key] = ps[key].newValue);
  if (ps.enabled) {
    install();
  }
});

// FAQs & Feedback
chrome.storage.local.get({
  'version': null,
  'faqs': false,
  'last-update': 0,
}, prefs => {
  const version = chrome.runtime.getManifest().version;

  if (prefs.version ? (prefs.faqs && prefs.version !== version) : true) {
    const now = Date.now();
    const doUpdate = (now - prefs['last-update']) / 1000 / 60 / 60 / 24 > 30;
    chrome.storage.local.set({
      version,
      'last-update': doUpdate ? Date.now() : prefs['last-update']
    }, () => {
      // do not display the FAQs page if last-update occurred less than 30 days ago.
      if (doUpdate) {
        const p = Boolean(prefs.version);
        chrome.tabs.create({
          url: chrome.runtime.getManifest().homepage_url + '?version=' + version +
            '&type=' + (p ? ('upgrade&p=' + prefs.version) : 'install'),
          active: p === false
        });
      }
    });
  }
});

{
  const {name, version} = chrome.runtime.getManifest();
  chrome.runtime.setUninstallURL(
    chrome.runtime.getManifest().homepage_url + '?rd=feedback&name=' + name + '&version=' + version
  );
}
