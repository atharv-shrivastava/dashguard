# DashGuard

An offline-first driving companion prototype. The intended Drive Mode brings camera awareness, motion monitoring, audible warnings and locally protected incident clips into one experience.

## Project areas

- `frontend/`: phone-first browser/PWA UI prototype. It includes foreground motion monitoring and a browser camera preview. It is not a background dashcam.
- `android/`: native Android application prototype using one CameraX session for camera preview and on-device object detection with MediaPipe.

## Native Android object detection

The Android project currently opens the rear camera, runs Google's EfficientDet-Lite0 detector locally, and overlays boxes for people and common vehicle categories. See [android/README.md](android/README.md) for build instructions and limitations.

The first Android build downloads the model and verifies its SHA-256 checksum. The model is bundled into the resulting APK, so object detection itself does not need a network connection after installation.

## Browser preview

Run the static UI locally:

```bash
cd frontend
python -m http.server 8080
```

Open `http://localhost:8080`. The PWA requires HTTPS or localhost for camera and motion APIs. It remains a UI/prototyping path; the native Android app is the intended owner of the production camera pipeline.

## Not implemented yet

Distance estimation, object tracking, time-to-collision, risk-based audio alerts, background/foreground recording service, the rolling 60-second buffer, protected event clips, and merging native detection into the complete Drive Mode UI still need implementation and device testing.
