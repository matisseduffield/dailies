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
  // `earlier` is counts for days before today that the saved results prove
  // (resultDays): a day played and never seen on the home screen still goes in.
  function noteDay(log, key, done, earlier) {
    const out = {}, oldest = back(key, 59);
    for (const k of Object.keys(log || {})) if (/^\d{4}-\d\d-\d\d$/.test(k) && k >= oldest && k <= key && log[k] > 0) out[k] = log[k];
    if (done > 0) out[key] = Math.max(out[key] || 0, done);
    for (const k of Object.keys(earlier || {})) if (k >= oldest && k < key && earlier[k] > 0) out[k] = Math.max(out[k] || 0, earlier[k]);
    return out;
  }
  // The games finished on each day, from the results still saved: each carries its
  // own date, as Date.toDateString() gives it. One only begun isn't a game finished.
  const MONTHS = 'JanFebMarAprMayJunJulAugSepOctNovDec';
  function resultDays(results) {
    const out = {};
    for (const r of results) {
      const m = r && !r.started && /^\w{3} (\w{3}) (\d\d) (\d{4})$/.exec(r.date);
      const month = m ? MONTHS.indexOf(m[1]) / 3 : -1;
      if (!Number.isInteger(month) || month < 0) continue;
      const k = `${m[3]}-${String(month + 1).padStart(2, '0')}-${m[2]}`;
      out[k] = (out[k] || 0) + 1;
    }
    return out;
  }
  // How many games there were to play on a day. `since` has an entry for each game:
  // the day it came out, as a key like the log's, or nothing for one that was there
  // from the start. A day with every game of its time played is a full day, however
  // many have been added since.
  const gamesOn = (key, since) => since.filter(day => !day || day <= key).length;
  // The last `n` days' keys, oldest first; today's is the last.
  const dayKeys = (key, n) => Array.from({ length: n }, (_, i) => back(key, n - 1 - i));
  // The last `n` days, oldest first, as counts; today is the last.
  const lastDays = (log, key, n) => Array.from({ length: n }, (_, i) => (log && log[back(key, n - 1 - i)]) || 0);
  // Days in a row with a game finished. Today not played yet doesn't break it.
  function dayRun(log, key) {
    let n = 0, at = log && log[key] ? 0 : 1;
    while (log && log[back(key, at)]) { n++; at++; }
    return n;
  }

  const all = { todayText, dayKey, noteDay, resultDays, gamesOn, dayKeys, lastDays, dayRun };
  if (typeof module === 'object' && module.exports) module.exports = all;
  else Object.assign(root, all);
})(this);
