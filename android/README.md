# DashGuard Android prototype

This is the native Android path for DashGuard. The existing `frontend/` folder remains a browser/PWA interface prototype; this Android project is where the camera and on-device vision pipeline begins.

## What is implemented

- One CameraX lifecycle-bound camera session feeds both the visible `PreviewView` and `ImageAnalysis`.
- The rear camera is selected.
- CameraX uses `STRATEGY_KEEP_ONLY_LATEST`; analysis samples frames at a bounded rate rather than building an inference backlog.
- MediaPipe Tasks Vision runs EfficientDet-Lite0 locally with the CPU delegate.
- Bounding boxes and confidence labels are drawn over the same camera preview.
- Only relevant COCO classes are displayed: person, bicycle, car, motorcycle, bus, train and truck.
- Camera permission, model-load errors, camera errors and start/stop lifecycle are handled.
- No camera frame is uploaded. Inference runs on the device.

## Build

Requirements: Android Studio with Android SDK 36, JDK 17, and Gradle 8.14.3.

Open this `android/` directory as a project in Android Studio, configure Gradle 8.14.3 if prompted, and run the `app` configuration on a physical Android phone.

From a terminal with Gradle 8.14.3 installed:

```bash
gradle -p android :app:assembleDebug
```

The debug APK is generated at:

```
android/app/build/outputs/apk/debug/app-debug.apk
```

The first build downloads the EfficientDet-Lite0 model into the Android assets folder and verifies its SHA-256 checksum. The model is then packaged inside the APK. Internet is required for that initial build-time download; normal detection after installation is offline.

A GitHub Actions workflow also builds the debug APK and publishes it as a workflow artifact when Android files are pushed.

## Model and current limits

The detector is the general-purpose EfficientDet-Lite0 model from Google's MediaPipe model collection. It can label common COCO objects, including people and common vehicle types. It is not a road-specific detector, object tracker, distance estimator or collision predictor.

This milestone does **not** implement:
- metric distance or time-to-collision,
- tracking IDs or stable object tracking across frames,
- audio alerts,
- background camera service,
- video recording or the 60-second pre-event buffer,
- integration of the existing browser motion graph into the native screen.

Detection quality and frame rate must be tested on the target phone before any safety-related use. Keep attention on the road; this prototype is not a driving safety system.

## Reference implementation

The CameraX + MediaPipe Tasks Vision flow and model verification pattern are adapted from Google's official [MediaPipe Android object-detection sample](https://github.com/google-ai-edge/mediapipe-samples/tree/main/examples/object_detection/android). See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for attribution and license information.
