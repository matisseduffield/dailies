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

  // The record of days: how many games were finished on each, kept on the phone
  // for the last two months. `key` is a local date, YYYY-MM-DD. A day's count
  // only goes up, so a result that's cleared later can't undo a day played.
  const dayKey = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const back = (key, n) => { const [y, m, d] = key.split('-').map(Number); return dayKey(new Date(y, m - 1, d - n)); };
  function noteDay(log, key, done) {
    const out = {}, oldest = back(key, 59);
    for (const k of Object.keys(log || {})) if (/^\d{4}-\d\d-\d\d$/.test(k) && k >= oldest && k <= key && log[k] > 0) out[k] = log[k];
    if (done > 0) out[key] = Math.max(out[key] || 0, done);
    return out;
  }
  // The last `n` days, oldest first, as counts; today is the last.
  const lastDays = (log, key, n) => Array.from({ length: n }, (_, i) => (log && log[back(key, n - 1 - i)]) || 0);
  // Days in a row with a game finished. Today not played yet doesn't break it.
  function dayRun(log, key) {
    let n = 0, at = log && log[key] ? 0 : 1;
    while (log && log[back(key, at)]) { n++; at++; }
    return n;
  }

  const all = { todayText, dayKey, noteDay, lastDays, dayRun };
  if (typeof module === 'object' && module.exports) module.exports = all;
  else Object.assign(root, all);
})(this);
