// After today's game: a link on to the next one not played yet, so a morning's
// games run one into the next. Each game calls showNext() from its result.
(function (root) {
  const GAMES = [['slugle', 'Slugle'], ['hunch', 'Hunch'], ['sorted', 'Sorted'], ['reach', 'Reach'], ['cluey', 'Cluey'], ['mend', 'Mend'], ['dated', 'Dated'], ['overland', 'Overland'], ['splice', 'Splice']];

  function played(id) {
    try {
      const result = JSON.parse(localStorage.getItem('hub.' + id));
      return !!result && result.date === Clock.now().toDateString() && !result.started;
    } catch { return false; }
  }

  // Today's game begun but not finished: the home screen says Started. Never
  // over today's result, and only from today's game, never Practice.
  root.markStarted = id => {
    const day = Clock.now().toDateString();
    try {
      const result = JSON.parse(localStorage.getItem('hub.' + id));
      if (result && result.date === day) return;
      localStorage.setItem('hub.' + id, JSON.stringify({ date: day, started: true }));
      // In the iPhone app: today's reminder is no longer wanted.
      if (root.ladderRemind) root.ladderRemind();
    } catch {}
  };

  root.showNext = (link, here, show = true) => {
    const at = GAMES.findIndex(g => g[0] === here);
    const rest = [...GAMES.slice(at + 1), ...GAMES.slice(0, at)];
    const next = show && rest.find(g => !played(g[0]));
    link.hidden = !next;
    if (!next) return;
    link.href = `../${next[0]}/index.html`;
    link.textContent = `Play ${next[1]} next`;
    // Replacing this page keeps Back going to the home screen, not the last game.
    link.onclick = e => { e.preventDefault(); location.replace(link.href); };
  };

  // The result's foot reads "streak · next game" on one line. When it won't
  // fit, the parts stack without the dot instead of a line starting with one.
  // Measured unstacked each time, so taking the dot out can't flip it back.
  if (root.document) for (const foot of root.document.querySelectorAll('.result-foot')) {
    const fit = () => {
      foot.classList.remove('stack');
      const parts = [...foot.children];
      foot.classList.toggle('stack', parts.some(p => p.offsetTop !== parts[0].offsetTop));
    };
    new MutationObserver(fit).observe(foot, { childList: true });
    new ResizeObserver(fit).observe(foot);
  }
})(this);
