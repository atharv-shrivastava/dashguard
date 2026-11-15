# DashGuard frontend

Phone-first, warm and calm web app built with plain HTML, CSS and JavaScript. The live camera detector uses the pinned MediaPipe Tasks Vision Web runtime in a Web Worker.

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

## Live camera preview

Drive Mode now requests a live video preview when **Start Drive** is tapped. It prefers the rear-facing camera, requests video only (no microphone), and places the stream directly in the Drive screen. Use **Stop Camera** to release it without ending Drive Mode. Leaving the Drive screen or ending Drive Mode also stops every camera track.

- Camera access requires a secure context: use HTTPS or localhost. The browser will ask for camera permission.
- Rear-camera selection is a preference, not a guarantee on every device/browser.
- The preview is foreground-only and is **not recording or saving video**. Local object detection starts automatically on the same camera stream when the detector has loaded.
- If permission is denied, the camera is unavailable, or another app is using it, the Drive screen shows an error and allows a retry.
- The native camera indicator remains controlled by the operating system/browser.

## Run motion-monitor tests

From this directory, with Node.js installed:

```bash
node --test tests/*.test.cjs
```

The tests cover linear-acceleration readings, jerk calculation, the gravity-compensated fallback, gyroscope readings, denied permission, and missing sensor data. They use mocked browser events; they do not replace testing on a physical phone.

## Live object detection

The Drive screen runs Google's EfficientDet-Lite0 object detector through MediaPipe Tasks Vision 1.2.3 in a dedicated Web Worker. It analyses frames from the existing camera preview stream and draws real boxes and confidence labels over that same video. No second camera session is opened. The model recognises common COCO categories; DashGuard displays people, bicycles, cars, motorcycles, buses, trains, trucks, traffic lights, stop signs and parking meters. The detector is throttled to roughly 5–6 frames per second to limit phone load.

The runtime and model are fetched on first use and cached by the service worker where the browser permits. Connect once before expecting offline detection. Clearing site data removes those cached assets. MediaPipe performs image inference on-device and does not send camera frames to Google, though the SDK may send usage metrics as described in its privacy notice. The model and runtime are not bundled in the source repository.

Detection boxes are object labels only. This milestone does not estimate distance, track objects over time, calculate time-to-collision, or trigger safety alerts. Detection speed and quality depend on the phone and browser and must be tested on-device. This is not a driving safety system.

## Not connected yet

Distance/TTC estimation, audio safety alerts, video recording, 60-second pre-event buffering and protected event clips are not implemented. Browser camera and sensor access remain foreground-only.

A browser/PWA shell does not provide dependable background camera recording on a phone. The eventual camera, sensor and rolling-recording pipeline must live in a platform layer that can own those device capabilities.


## Object-detection tests

The detection-controller tests use a mocked worker and canvas geometry; they do not test real model accuracy or frame rate. Real detection requires HTTPS or localhost, a supported modern browser, camera permission and a first online model/runtime load.
