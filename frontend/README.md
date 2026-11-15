# DashGuard frontend

Phone-first, warm and calm UI prototype built with plain HTML, CSS and JavaScript. No framework or runtime package dependency is required.

## Run locally

From this directory:

```bash
python -m http.server 8080
```

Open http://localhost:8080. Installability and offline caching require serving from localhost or HTTPS. The service worker caches the UI shell after first load.

## Screens

- Home: camera-view illustration, drive snapshot and Start Drive.
- Drive: preview overlay, alert status, illustrative motion graph, timer and End Drive.
- Events: local saved-event placeholder.
- Settings: voice preference, pre-event duration and offline status.

## Important

This is a **frontend prototype only**. Camera access, object detection, distance/TTC calculations, physical accelerometer and gyroscope readings, audio alerts, video recording and event clip preservation are not connected. Camera boxes, distance values and the motion graph are illustrative. Do not use this preview as a driving safety system.

A browser/PWA shell does not provide dependable background camera recording on a phone. The eventual camera, sensor and rolling-recording pipeline must live in a platform layer that can own those device capabilities.