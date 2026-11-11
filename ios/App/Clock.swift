import Foundation

/// The time from our server, so moving the phone's clock can't bring tomorrow's
/// puzzle early. Each reading is kept with the phone's time since it started,
/// which the clock settings don't touch, so the time carries on offline.
///
/// Time since start begins again on a restart. After one, the time moves on by
/// however far the phone's own clock has, and never by less than the phone has
/// been on, nor back before the reading. The phone's clock is only kept as a
/// mark while it agrees with ours. (The Android app does the same: see
/// TrustedClock.kt.)
@MainActor
enum Clock {
    private static let server = URL(string: "https://dailies.matisseduffield.workers.dev/now")!
    private static let wallAgrees = 10.0 * 60 * 1000
    private static var checking = false
    private static var kept: [String: Double]? = load()

    // Kept out of the phone's backup: time since start means nothing on another
    // phone, where a restored reading could run ahead.
    private static var file: URL {
        let folder = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0]
        try? FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        return folder.appendingPathComponent("clock.json")
    }

    private static func load() -> [String: Double]? {
        guard let data = try? Data(contentsOf: file),
              let saved = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any] else { return nil }
        var values: [String: Double] = [:]
        for (key, value) in saved {
            if let number = value as? NSNumber { values[key] = number.doubleValue }
        }
        return values
    }

    /// Milliseconds since the phone started, counting time asleep.
    private static func sinceStart() -> Double { Double(clock_gettime_nsec_np(CLOCK_MONOTONIC_RAW)) / 1_000_000 }
    private static func wall() -> Double { Date().timeIntervalSince1970 * 1000 }

    // Keeps a time as if read just now.
    private static func keep(_ time: Double, offset: Double?) {
        var next: [String: Double] = ["time": time, "start": sinceStart()]
        let phone = wall()
        if abs(phone - time) <= wallAgrees { next["wall"] = phone }
        if let offset { next["offset"] = offset }
        kept = next
        if let data = try? JSONSerialization.data(withJSONObject: next) { try? data.write(to: file, options: .atomic) }
    }

    /// For the pages: `{ now, offset }` as JSON, or empty before the first reading.
    static func read() -> String {
        guard let saved = kept, let time = saved["time"], let then = saved["start"] else { return "" }
        let start = sinceStart()
        var now = time + (start - then)
        if start < then {
            // Restarted. All of this run is since the reading, so it's the least that's passed.
            let passed = saved["wall"].map { wall() - $0 } ?? 0
            now = time + max(start, passed)
            keep(now, offset: saved["offset"])
        }
        var reading: [String: Any] = ["now": NSNumber(value: Int64(now))]
        if let offset = saved["offset"] { reading["offset"] = NSNumber(value: Int(offset)) }
        guard let data = try? JSONSerialization.data(withJSONObject: reading) else { return "" }
        return String(data: data, encoding: .utf8) ?? ""
    }

    /// Takes a new reading, trying again once if the server can't be reached.
    static func check(tries: Int = 2, then done: @escaping @MainActor () -> Void = {}) {
        guard !checking else { return }
        checking = true
        let request = URLRequest(url: server, cachePolicy: .reloadIgnoringLocalAndRemoteCacheData, timeoutInterval: 5)
        URLSession.shared.dataTask(with: request) { data, response, _ in
            var now: Double?
            var offset: Double?
            if (response as? HTTPURLResponse)?.statusCode == 200, let data,
               let reading = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any] {
                now = (reading["now"] as? NSNumber)?.doubleValue
                offset = (reading["offset"] as? NSNumber)?.doubleValue
            }
            let time = now, zone = offset
            Task { @MainActor in
                checking = false
                if let time {
                    keep(time, offset: zone)
                    done()
                } else if tries > 1 {
                    try? await Task.sleep(nanoseconds: 6_000_000_000)
                    check(tries: tries - 1, then: done)
                }
            }
        }.resume()
    }
}
