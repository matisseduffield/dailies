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

    /// A tapped reminder opens the hub.
    static func opened(notification: [AnyHashable: Any]) {
        Shell.current?.show(config.start)
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
    })();
    """#
}
