'use strict';

var panels = require('sdk/panel');
var self = require('sdk/self');
var sp = require('sdk/simple-prefs');
var prefs = sp.prefs;
var tabs = require('sdk/tabs');
var timers = require('sdk/timers');
var core = require('sdk/view/core');
var unload = require('sdk/system/unload');
var runtime = require('sdk/system/runtime');
var pageMod = require('sdk/page-mod');
var policy = require('./policy');
var {ToggleButton} = require('sdk/ui/button/toggle');
var {Cu} = require('chrome');

var {devtools} = Cu.import('resource://gre/modules/devtools/Loader.jsm');
var HUDService;
try {
  HUDService = devtools.require('devtools/webconsole/hudservice');
}
catch (e) {
  HUDService = devtools.require('devtools/client/webconsole/hudservice');
}

var path = './icons/' + (runtime.OS === 'Darwin' ? 'mac/' : '');

var filters = {
  read: function () {
    return JSON.parse(prefs.filters || '[]');
  },
  write: function (val) {
    var fs = this.read();
    fs.push(val);
    prefs.filters = JSON.stringify(fs);
    policy.filters(fs);
  },
  remove: function (id) {
    var fs = this.read();
    prefs.filters = JSON.stringify(fs.filter(o => o.id !== +id));
    policy.filters(this.read());
  }
};

var states = [];

var button = new ToggleButton({
  id: 'policy-control',
  label: 'Policy Control',
  icon: {
    '16': path + '16.png',
    '32': path + '32.png',
    '64': path + '64.png',
  },
  onChange: function (state) {
    if (state.checked) {
      panel.show({
        position: button
      });
    }
  }
});
function state (obj) {
  button.state('window', Object.assign({
    badge: button.state('window').badge,
    checked: button.state('window').checked
  }, obj));
}

var panel = panels.Panel({
  contentScriptOptions: {
    font: sp.prefs.font
  },
  contentURL: self.data.url('popover/index.html'),
  contentScriptFile: self.data.url('popover/index.js'),
  onHide: () => state({checked: false})
});
core.getActiveView(panel).setAttribute('tooltip', 'aHTMLTooltip');

panel.port.on('size', function (obj) {
  panel.width = obj.width;
  panel.height = obj.height;
});

panel.port.on('get-preference', function (name) {
  panel.port.emit('set-preference', {
    name,
    value: prefs[name]
  });
});
panel.port.on('set-preference', function (obj) {
  prefs[obj.name] = obj.value;
});
sp.on('*', function (name) {
  if (name) {
    panel.port.emit('set-preference', {
      name,
      value: prefs[name]
    });
  }
});
panel.port.on('command', function (obj) {
  if (obj.cmd === 'options') {
    options();
    panel.hide();
  }
  if (obj.cmd === 'console') {
    HUDService.openBrowserConsoleOrFocus();
    panel.hide();
  }
  if (obj.cmd.indexOf('log-') === 0 || obj.cmd === 'private') {
    prefs[obj.cmd] = obj.value;
  }
  if (obj.cmd === 'enable') {
    if (obj.value === 'true') {
      states = obj.states;
      states.forEach(function (obj) {
        prefs[obj.name] = false;
      });
      panel.port.emit('enabled', false);
    }
    else {
      states.forEach(function (obj) {
        prefs[obj.name] = obj.status;
      });
      panel.port.emit('enabled', true);
    }
    if (obj.enabled === 'false') {
      states = [];
    }
  }
});

unload.when(function () {
  if (states.length) {
    states.forEach(function (obj) {
      prefs[obj.name] = obj.status;
    });
  }
});

/* policy */
policy.badge(count => state({badge: count || ''}));
policy.filters(filters.read());

/* settings page */
function closeOptions () {
  for (let tab of tabs) {
    if (tab.url.indexOf(self.data.url('settings/index.html')) === 0) {
      tab.close();
    }
  }
}
function options () {
  closeOptions();
  tabs.open(self.data.url('settings/index.html'));
}
unload.when(closeOptions);
pageMod.PageMod({
  include: self.data.url('settings/index.html'),
  contentScriptFile: self.data.url('settings/index.js'),
  contentScriptWhen: 'ready',
  onAttach: function (worker) {
    worker.port.on('list', function () {
      worker.port.emit('list', filters.read());
    });
    worker.port.on('delete', function (id) {
      filters.remove(id);
      worker.port.emit('delete', id);
    });
    worker.port.on('insert', function (obj) {
      var id = (prefs.id || 0) + 1;
      prefs.id = id;
      obj.id = id;
      filters.write(obj);
      worker.port.emit('insert', obj);
    });
  }
});
sp.on('options', options);

/* welcome */
exports.main = function (options) {
  if (options.loadReason === 'install' || options.loadReason === 'startup') {
    var version = sp.prefs.version;
    if (self.version !== version) {
      if (true) {
        timers.setTimeout(function () {
          tabs.open(
            'http://firefox.add0n.com/policy-control.html?v=' + self.version +
            (version ? '&p=' + version + '&type=upgrade' : '&type=install')
          );
        }, 3000);
      }
      sp.prefs.version = self.version;
    }
  }
};
