/**
 * Shared console info for Homie Scheduler cards.
 * Logs branded card name. No version in resources to avoid cache sticking to old builds.
 */
if (typeof window.logCardInfo === 'undefined') {
  window.logCardInfo = function (cardName) {
    console.info(
      '%c Homie Scheduler %c ' + cardName,
      'color: white; background:rgb(94, 94, 243); font-weight: 700; padding 5px;',
      'color: rgb(94, 94, 243); background: white; font-weight: 700; padding 5px;'
    );
  };
}
