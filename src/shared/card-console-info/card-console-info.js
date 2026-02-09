/**
 * Shared console info for Homie Scheduler cards.
 * Logs branded card name and release version (set at build time).
 */

function logCardInfo(cardName) {
  var version = typeof window.__HOMIE_SCHEDULER_CARDS_VERSION !== 'undefined'
    ? window.__HOMIE_SCHEDULER_CARDS_VERSION
    : 'dev';
  var label = cardName + ' v' + version;
  console.info(
    '%c Homie Scheduler %c ' + label,
    'color: white; background:rgb(94, 94, 243); font-weight: 700; padding 5px;',
    'color: rgb(94, 94, 243); background: white; font-weight: 700; padding 5px;'
  );
}
