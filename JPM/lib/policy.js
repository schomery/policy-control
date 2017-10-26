'use strict';

var sp = require('sdk/simple-prefs');
var prefs = sp.prefs;
var timers = require('sdk/timers');
var utils = require('sdk/tabs/utils');
var urls = require('sdk/url');
var tabs = require('sdk/tabs');
var utils = require('sdk/tabs/utils');
var unload = require('sdk/system/unload');
var {Unknown, Factory} = require('sdk/platform/xpcom');
var {isPrivate} = require('sdk/private-browsing');
var {Class} = require('sdk/core/heritage');
var {Cc, Ci} = require('chrome');
var {MatchPattern} = require('sdk/util/match-pattern');
var {viewFor} = require('sdk/view/core');

var categoryManager = Cc['@mozilla.org/categorymanager;1']
  .getService(Ci.nsICategoryManager);
var pointers = {
  privates: new WeakMap(),
  tabs: new WeakMap(),
  counts: new WeakMap(),
};
var af = {};
var id;
var setBadge = function () {};
var types = {
  2: 'TYPE_SCRIPT',
  3: 'TYPE_IMAGE',
  4: 'TYPE_STYLESHEET',
  5: 'TYPE_OBJECT',
  7: 'TYPE_SUBDOCUMENT',
  10: 'TYPE_PING',
  11: 'TYPE_XMLHTTPREQUEST',
  12: 'TYPE_OBJECT_SUBREQUEST',
  14: 'TYPE_FONT',
  15: 'TYPE_MEDIA',
  16: 'TYPE_WEBSOCKET',
  19: 'TYPE_BEACON'
};
var [modes, active] = (function (map, tmp1, tmp2) {
  for (let name in map) {
    tmp1[map[name]] = prefs['mod-' + name];
    tmp2[map[name]] = prefs['policy-' + name];
  }
  sp.on('*', function (pref) {
    if (pref.indexOf('mod-') === 0) {
      tmp1[map[pref.split('-')[1]]] = prefs[pref];
    }
    if (pref.indexOf('policy-') === 0) {
      tmp2[map[pref.split('-')[1]]] = prefs[pref];
    }
  });
  return [tmp1, tmp2];
})({
  'font': Ci.nsIContentPolicy.TYPE_FONT,
  'image': Ci.nsIContentPolicy.TYPE_IMAGE,
  'media': Ci.nsIContentPolicy.TYPE_MEDIA,
  'object': Ci.nsIContentPolicy.TYPE_OBJECT,
  'stylesheet': Ci.nsIContentPolicy.TYPE_STYLESHEET,
  'script': Ci.nsIContentPolicy.TYPE_SCRIPT,
  'subdomain': Ci.nsIContentPolicy.TYPE_SUBDOCUMENT,
  'request': Ci.nsIContentPolicy.TYPE_XMLHTTPREQUEST,
  'subrequest': Ci.nsIContentPolicy.TYPE_OBJECT_SUBREQUEST,
  'websocket': Ci.nsIContentPolicy.TYPE_WEBSOCKET,
  'ping': Ci.nsIContentPolicy.TYPE_PING,
  'beacon': Ci.nsIContentPolicy.TYPE_BEACON
}, {}, {});

function getTopContext (context) {
  if (!(context instanceof Ci.nsIDOMWindow)) {
    if (context instanceof Ci.nsIDOMNode && context.ownerDocument) {
      context = context.ownerDocument;
    }
    if (context instanceof Ci.nsIDOMDocument) {
      context = context.defaultView;
    }
    else {
      context = null;
    }
  }
  return context && context.top ? context.top : context;
}

tabs.on('activate', function (tab) {
  let browser = utils.getBrowserForTab(viewFor(tab));
  let count = pointers.counts.get(browser);
  setBadge(count);
});

function valid (url, top, type) {
  let filters = af[type];
  if (!filters) {
    return true;
  }
  let partial = modes[type] === 'p';
  if (partial) {
    try {
      let host = urls.URL(url).host;
      if ((host && host.split(top)[1] === '') || url.indexOf('data:') === 0) {
        if (prefs['log-passed']) {
          console.error('[Passed]', 'Passed by third-party rule', url, 'domain:', top);
        }
        return false;
      }
    }
    catch (e) {
      console.error(e);
    }
  }

  for (let i = 0; i < filters.length; i++) {
    let filter = filters[i];
    if (filter.domain !== '*' && filter.domain !== top && filter.domain !== top) {
      continue;
    }
    try {
      if (filter.matching === 'RegExp') {
        let re = new RegExp(filter.url);
        if (re.test(url)) {
          if (prefs['log-passed']) {
            console.error('[Passed]', 'passed by RegExp matching rule', 'domain:', url);
          }
          return false;
        }
      }
      else {
        let pattern = new MatchPattern(filter.url);
        if (pattern.test(url)) {
          if (prefs['log-passed']) {
            console.error('[Passed]', 'passed by WildCard matching rule', 'domain:', url);
          }
          return false;
        }
      }
    }
    catch (e) {
      console.error(e);
    }
  }
  return true;
}

var policy2 = new Class({
  extends: Unknown,
  interfaces: ['nsISimpleContentPolicy'],
  shouldLoad: function (aContentType, aContentLocation, aRequestOrigin, aTopFrameElement, aIsTopLevel, aMimeTypeGuess, aExtra, aRequestPrincipal) {
    // do not block at document level
    if (aContentType === Ci.nsIContentPolicy.TYPE_DOCUMENT) {
      pointers.privates.set(aTopFrameElement, isPrivate(aTopFrameElement.contentWindow));
      pointers.counts.set(aTopFrameElement, 0);
      for (let t of tabs) {
        if (utils.getBrowserForTab(viewFor(t)) === aTopFrameElement) {
          pointers.tabs.set(aTopFrameElement, t);
          if (t === tabs.activeTab) {
            setBadge(0);
          }
          break;
        }
      }
      return Ci.nsIContentPolicy.ACCEPT;
    }
    // from internal
    if (!aTopFrameElement) {
      return Ci.nsIContentPolicy.ACCEPT;
    }
    // type is not supported
    if (!types[aContentType]) {
      return Ci.nsIContentPolicy.ACCEPT;
    }
    // white-listed resources
    if (!active[aContentType]) {
      return Ci.nsIContentPolicy.ACCEPT;
    }
    // do not blocked in the private mode (if activated)
    if (prefs.private && pointers.privates.get(aTopFrameElement)) {
      return Ci.nsIContentPolicy.ACCEPT;
    }
    if (aRequestOrigin && (aRequestOrigin.scheme === 'http' || aRequestOrigin.scheme === 'https')) {
      // validate
      let url = aContentLocation.spec;
      let top = aRequestPrincipal ? aRequestPrincipal.baseDomain : '';

      if (valid(url, top, aContentType)) {
        if (prefs['log-blocked']) {
          console.error('[Blocked] url:', url, 'domain:', top, 'type:', types[aContentType]);
        }
        let count = (pointers.counts.get(aTopFrameElement) || 0) + 1;
        pointers.counts.set(aTopFrameElement, count);
        if (count) {
          timers.clearTimeout(id);
          id = timers.setTimeout(function (context) {
            let tab = pointers.tabs.get(context);
            if (tab && tabs.activeTab === tab) {
              setBadge(pointers.counts.get(context));
            }
          } , 100, aTopFrameElement);
        }
        return Ci.nsIContentPolicy.REJECT_REQUEST;
      }
    }
    return Ci.nsIContentPolicy.ACCEPT;
  },
  shouldProcess: () => Ci.nsIContentPolicy.ACCEPT
});
// registering
(function (factory) {
  categoryManager.addCategoryEntry('simple-content-policy', factory.contract, factory.contract, false, true);
  unload.when(() => categoryManager.deleteCategoryEntry('simple-content-policy', factory.contract, false));
})(new Factory({
  Component:   policy2,
  contract:    '@add0n.com/simpletestpolicy;1',
  description: 'Blocking network resources'
}));

exports.badge = c => setBadge = c;

exports.filters = function (filters) {
  af[Ci.nsIContentPolicy.TYPE_FONT] = filters.filter(o => o.enabled && o.type === 'TYPE_FONT');
  af[Ci.nsIContentPolicy.TYPE_IMAGE] = filters.filter(o => o.enabled && o.type === 'TYPE_IMAGE');
  af[Ci.nsIContentPolicy.TYPE_MEDIA] = filters.filter(o => o.enabled && o.type === 'TYPE_MEDIA');
  af[Ci.nsIContentPolicy.TYPE_OBJECT] = filters.filter(o => o.enabled && o.type === 'TYPE_OBJECT');
  af[Ci.nsIContentPolicy.TYPE_STYLESHEET] = filters.filter(o => o.enabled && o.type === 'TYPE_STYLESHEET');
  af[Ci.nsIContentPolicy.TYPE_SCRIPT] = filters.filter(o => o.enabled && o.type === 'TYPE_SCRIPT');
  af[Ci.nsIContentPolicy.TYPE_SUBDOCUMENT] = filters.filter(o => o.enabled && o.type === 'TYPE_SUBDOCUMENT');
  af[Ci.nsIContentPolicy.TYPE_XMLHTTPREQUEST] = filters.filter(o => o.enabled && o.type === 'TYPE_XMLHTTPREQUEST');
  af[Ci.nsIContentPolicy.TYPE_OBJECT_SUBREQUEST] = filters.filter(o => o.enabled && o.type === 'TYPE_OBJECT_SUBREQUEST');
  af[Ci.nsIContentPolicy.TYPE_WEBSOCKET] = filters.filter(o => o.enabled && o.type === 'TYPE_WEBSOCKET');
  af[Ci.nsIContentPolicy.TYPE_PING] = filters.filter(o => o.enabled && o.type === 'TYPE_PING');
  af[Ci.nsIContentPolicy.TYPE_BEACON] = filters.filter(o => o.enabled && o.type === 'TYPE_BEACON');
};

unload.when(function () {
  prefs['log-blocked'] = false;
  prefs['log-passed'] = false;
});
