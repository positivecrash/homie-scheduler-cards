/**
 * Shared console info for Homie Scheduler cards.
 * Version comes from bundle (set at build time) so it matches the loaded script.
 */
if (typeof window.logCardInfo === 'undefined') {
  window.logCardInfo = function (cardName) {
    const v = typeof window.__HOMIE_SCHEDULER_CARDS_VERSION !== 'undefined' ? ' ' + window.__HOMIE_SCHEDULER_CARDS_VERSION : '';
    console.info(
      '%c Homie Scheduler' + v + ' %c ' + cardName,
      'color: white; background:rgb(94, 94, 243); font-weight: 700; padding 5px;',
      'color: rgb(94, 94, 243); background: white; font-weight: 700; padding 5px;'
    );
  };
}
