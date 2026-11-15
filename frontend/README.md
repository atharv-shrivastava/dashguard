# DashGuard frontend

Phone-first, warm and calm UI prototype built with plain HTML, CSS and JavaScript. No framework or runtime package dependency is required.

## Run locally

From this directory:

```bash
python -m http.server 8080
```

Open http://localhost:8080. Installability and offline caching require serving from localhost or HTTPS. The service worker caches the UI shell, including the motion-monitor module, after the first load.

## Screens

- Home: camera-view illustration, drive snapshot and Start Drive.
- Drive: preview overlay, alert status, live phone motion monitor, rolling jerk graph, timer and End Drive.
- Events: local saved-event placeholder.
- Settings: voice preference, pre-event duration and offline status.

## Live motion monitor

The Drive screen now reads browser `DeviceMotionEvent` data after the user taps **Enable Motion**. It plots a rolling 20-second jerk trace, displays linear acceleration, and displays gyroscope rotation rate when the browser provides it.

- Serve from HTTPS or localhost. Browsers generally restrict motion sensors on insecure origins.
- iOS browsers that require motion permission show the native permission prompt after the user taps the button.
- Some browsers/devices may not provide linear acceleration or gyroscope fields. A gravity-compensated fallback is used for acceleration when possible; missing gyroscope data is shown as unavailable.
- The motion monitor runs while the page is active. It is not a background sensor service.
- The displayed high-jerk marker uses a prototype threshold and is **not calibrated, validated, or connected to automatic event capture**.

## Run motion-monitor tests

From this directory, with Node.js installed:

\`\`\`bash
node --test tests/motion.test.cjs
\`\`\`

The tests cover linear-acceleration readings, jerk calculation, the gravity-compensated fallback, gyroscope readings, denied permission, and missing sensor data. They use mocked browser events; they do not replace testing on a physical phone.

## Not connected yet

Camera access, object detection, distance/TTC estimation, audio safety alerts, video recording, 60-second pre-event buffering and protected event clips are not implemented. Camera boxes and distance labels remain illustrative. Do not use this preview as a driving safety system.

A browser/PWA shell does not provide dependable background camera recording on a phone. The eventual camera, sensor and rolling-recording pipeline must live in a platform layer that can own those device capabilities.
