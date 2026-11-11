import UIKit

/// Dailies on iPhone: the hub and its games, kept in the app.
@MainActor
enum App {
    // The pages already know this address as "inside the app".
    static let config = ShellConfig(
        bridge: "ladderApp",
        host: "appassets.androidplatform.net",
        root: "/assets/",
        start: "/assets/index.html",
        background: UIColor(named: "Page") ?? .systemBackground
    )

    static func launched() { Clock.check { Shell.current?.run(Page.retake) } }

    static func setUp(_ shell: Shell) {
        shell.scripts = [Page.script]
        shell.answer = { $0 == "clock" ? Clock.read() : nil }
        // Back in front: the day may have changed, or the phone's clock.
        shell.onActive = { [weak shell] in
            shell?.run(Page.retake)
            shell?.run("window.ladderAsk && ladderAsk()")
            Clock.check { shell?.run(Page.retake) }
        }
    }

    static func opened(link: URL) {}

    /// A tapped reminder opens the hub, unless a page is already up: a game
    /// under way stays as it is.
    static func opened(notification: [AnyHashable: Any]) {
        guard let shell = Shell.current, !shell.onAppPage else { return }
        shell.show(config.start)
    }
}

/// What every page gets before its own scripts run.
enum Page {
    static let retake = "window.ladderClockSet && ladderClockSet()"

    static let script = #"""
    (() => {
      // The time the games go by (see web/clock.js): the app's reading of our
      // server's clock, carried on by this page's own steady timer.
      let base = null, mark = 0;
      const take = () => {
        try {
          const text = prompt('shell:clock');
          base = text ? JSON.parse(text) : null;
        } catch (e) { base = null; }
        mark = performance.now();
      };
      take();
      window.ladderClock = {
        read: () => (base ? JSON.stringify({ now: base.now + performance.now() - mark, offset: base.offset }) : ''),
      };
      window.ladderClockSet = () => { take(); dispatchEvent(new Event('clock')); };

      // The 6 pm reminder: one for each of the next two weeks, and none today
      // once a game has been opened. Opening the app makes the list again, so
      // it stops by itself for someone who has stopped playing.
      window.ladderRemind = () => {
        const items = [];
        try {
          if (localStorage.getItem('hub.remind') === 'true') {
            const day = (window.Clock ? Clock.now() : new Date()).toDateString();
            let played = false;
            for (let i = 0; i < localStorage.length; i++) {
              const key = localStorage.key(i);
              if (!key.startsWith('hub.')) continue;
              try {
                const saved = JSON.parse(localStorage.getItem(key));
                if (saved && saved.date === day) played = true;
              } catch (e) {}
            }
            for (let d = 0; d < 14; d++) {
              if (!d && played) continue;
              const at = new Date();
              at.setDate(at.getDate() + d);
              at.setHours(18, 0, 0, 0);
              if (at.getTime() > Date.now()) items.push({ id: 'day-' + d, at: at.getTime(), title: 'Dailies', body: "Today's puzzles are waiting." });
            }
          }
          window.ladderApp.postMessage(JSON.stringify({ type: 'notify', items }));
        } catch (e) {}
      };
      addEventListener('pagehide', window.ladderRemind);
      document.addEventListener('visibilitychange', () => { if (document.hidden) window.ladderRemind(); });

      // A swipe from the edge closes an open sheet, or leaves practice, before
      // it leaves the game. A game says when it has something to go back from
      // ({ type: 'back' }); while it does, the page holds a step in its history
      // for the swipe to take, and window.ladderBack() does the going back.
      let want = false, held = !!(history.state && history.state.held), busy = false;
      const settle = () => {
        if (busy || want === held) return;
        if (want) { history.pushState({ held: true }, ''); held = true; return; }
        busy = true;
        history.back();
      };
      const app = window.ladderApp, post = app.postMessage;
      app.postMessage = s => {
        let m = null;
        try { m = JSON.parse(s); } catch (e) {}
        if (!m || m.type !== 'back') return post(s);
        want = !!m.enabled;
        settle();
      };
      addEventListener('popstate', e => {
        held = !!(e.state && e.state.held);
        if (busy) { busy = false; return settle(); }
        if (!held && want) { want = false; if (window.ladderBack) window.ladderBack(); return; }
        settle();
      });

      // The way out of a game goes back to the home screen it came from, so a
      // swipe from the edge there doesn't lead into the game again.
      document.addEventListener('click', e => {
        const a = e.target.closest && e.target.closest('a.brand[href]');
        if (!a) return;
        e.preventDefault();
        const steps = held ? 2 : 1;
        if (history.length <= steps) return location.replace(a.href);
        const late = setTimeout(() => location.replace(a.href), 700);
        addEventListener('pagehide', () => clearTimeout(late), { once: true });
        history.go(-steps);
      });
    })();
    """#
}
