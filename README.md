# DashGuard

An offline-first, phone-first driving companion web app built with HTML, CSS and JavaScript.

## Current web features

- Phone-first Drive Mode interface.
- Rear-camera preview with on-device face and road-object detection using MediaPipe Tasks Vision in a Web Worker.
- Lightweight multi-object tracking with session IDs across consecutive frames.
- Live phone motion monitoring with acceleration, gyroscope readings when available, and a rolling jerk graph.
- Service-worker caching for the app shell and the vision runtime/model after first use where supported by the browser.

## Run locally

```bash
cd frontend
python -m http.server 8080
```

Open http://localhost:8080. Camera and motion access require localhost or HTTPS and browser permission.

## Not implemented yet

Metric distance estimation, time-to-collision, risk-based audio alerts, continuous recording, the rolling 60-second pre-event buffer and protected event clips are not implemented. Camera and motion monitoring are foreground-only. This prototype is not a validated driving-safety system.
