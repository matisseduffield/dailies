// Share today: the day's results in one message, a line for each game played,
// in the home screen's order. Each game saves its line (`card`) with its result;
// one saved before cards gives its words in the same shape. A game only begun
// (`started`) has no result yet. The blank square follows the phone's theme.
(function (root) {
  // entries: [[name, saved result or null]...]; day: Date.toDateString() of today.
  function todayText(entries, { day, date, total, dark, site }) {
    const lines = entries.filter(([, r]) => r && r.date === day && !r.started).map(([name, r]) => {
      if (typeof r.card === 'string' && r.card) return dark ? r.card.replace(/⬜/g, '⬛') : r.card;
      const text = String(r.text || '').replace(/, /g, ' · ');
      return `${name} ${text.charAt(0).toLowerCase()}${text.slice(1)}`.trim();
    });
    if (!lines.length) return '';
    return [`Dailies · ${date} · ${lines.length} of ${total}`, ...lines, site].join('\n');
  }

  if (typeof module === 'object' && module.exports) module.exports = { todayText };
  else root.todayText = todayText;
})(this);
