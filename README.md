# DashGuard

A phone-first driving companion focused on one integrated Drive Mode: camera-based road awareness, motion monitoring, audible alerts, and locally protected event recordings.

## Current repository state

The first deliverable is the **mobile-first frontend preview** in [`frontend/`](frontend/). It uses plain HTML, CSS and JavaScript, with no framework or runtime package dependencies. A service worker caches the interface for offline viewing after its first load from localhost or HTTPS.

### Frontend preview

- Home dashboard with a camera-view illustration, drive summary and Start Drive action.
- Drive screen with a preview overlay, alert status, motion graph, timer and end-drive control.
- Saved Events and Settings screens.
- Responsive layout with safe-area spacing for phone screens.

**This is UI only.** Camera, object detection, distance/TTC estimation, accelerometer/gyroscope readings, recording, event capture and live audio alerts are not connected yet. All displayed detections and values are explicitly marked as illustrative.

## Run the preview

```bash
cd frontend
python -m http.server 8080
```

Open `http://localhost:8080`. You can also host the static `frontend/` folder over HTTPS and install it as a PWA where supported. The frontend itself is offline-cacheable after first load; this does not mean browser background camera recording is supported.

## Direction

The target is an offline-first phone experience. The interface can be reused as a web/PWA shell, but the camera + sensor + rolling-recording pipeline must run in a platform layer that can reliably own the camera and foreground/background lifecycle. Android native integration remains the leading candidate, but an APK distribution requirement is not part of the product definition.
