# DashGuard

An offline-first, phone-first driving companion prototype built with plain HTML, CSS and JavaScript.

## Current app

- `frontend/`: the browser/PWA application and its phone-first interface.
- Live rear-camera preview using the browser camera API. The preview runs in the foreground and does not record video.
- Live phone motion monitoring with acceleration, gyroscope readings when available, and a rolling jerk graph.
- A service worker caches the frontend shell after its first successful load from localhost or HTTPS.

## Run locally

```bash
cd frontend
python -m http.server 8080
```

Open http://localhost:8080. Camera and motion access require localhost or HTTPS and browser permission.

## Not implemented yet

Live object detection, object tracking, metric distance estimation, time-to-collision, risk-based audio alerts, continuous recording, the rolling 60-second pre-event buffer and protected local event clips are not implemented. Future detection and driving features will be developed within the browser/PWA app rather than a separate native application.

The current browser preview is foreground-only. It is not a dashcam or a validated driving-safety system.
