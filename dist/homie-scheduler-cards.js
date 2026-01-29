/**
 * Homie Scheduler Cards - Loader
 * Loads all card modules from the same directory (for HACS).
 * Add this file as a single Lovelace resource (JavaScript Module).
 */
(function() {
  var script = document.currentScript;
  var base = script.src.replace(/[^/]+$/, '');
  var files = [
    'homie-scheduler-boiler-button.js',
    'homie-scheduler-boiler-slots.js',
    'homie-scheduler-boiler-status.js',
    'homie-scheduler-climate-slots.js'
  ];
  files.forEach(function(file) {
    var el = document.createElement('script');
    el.src = base + file;
    el.type = 'module';
    document.head.appendChild(el);
  });
})();
