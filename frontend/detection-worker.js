/* MediaPipe Tasks Vision worker: all model inference stays on this device. */
"use strict";

const MEDIAPIPE_VERSION = "1.2.3";
const MEDIAPIPE_BASE = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@" + MEDIAPIPE_VERSION;
const MODEL_URL = "https://storage.googleapis.com/mediapipe-models/object_detector/efficientdet_lite0/float32/1/efficientdet_lite0.tflite";
const FACE_MODEL_URL = "https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_full_range/float16/1/blaze_face_full_range.tflite";

let detector = null;
let faceDetector = null;
let loading = false;

self.onmessage = async event => {
  const message = event.data || {};
  if (message.type === "init") {
    if (loading || detector) return;
    loading = true;
    try {
      const { FilesetResolver, ObjectDetector, FaceDetector } = await import(
        MEDIAPIPE_BASE + "/vision_bundle.mjs"
      );
      const vision = await FilesetResolver.forVisionTasks(MEDIAPIPE_BASE + "/wasm");
      detector = await ObjectDetector.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: MODEL_URL,
          delegate: "CPU"
        },
        runningMode: "VIDEO",
        scoreThreshold: 0.35,
        maxResults: 25
      });
      try {
        faceDetector = await FaceDetector.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: FACE_MODEL_URL,
            delegate: "CPU"
          },
          runningMode: "VIDEO",
          minDetectionConfidence: 0.45,
          minSuppressionThreshold: 0.3
        });
      } catch (faceError) {
        // Keep road-object detection available if the optional face model fails.
        self.postMessage({
          type: "error",
          fatal: false,
          message: "Face detection is unavailable, but road-object detection is still running. " +
            (faceError && faceError.message ? faceError.message : "")
        });
      }
      loading = false;
      self.postMessage({ type: "ready" });
    } catch (error) {
      loading = false;
      self.postMessage({
        type: "error",
        fatal: true,
        message: "The local vision model could not load. Connect once to download its runtime and model, then retry. " +
          (error && error.message ? error.message : "")
      });
    }
    return;
  }

  if (message.type === "close") {
    if (detector) detector.close();
    if (faceDetector) faceDetector.close();
    detector = null;
    faceDetector = null;
    self.close();
    return;
  }

  if (message.type === "frame" && detector && message.bitmap) {
    const bitmap = message.bitmap;
    const startedAt = performance.now();
    try {
      const result = detector.detectForVideo(bitmap, message.timestampMs);
      const faceResult = faceDetector
        ? faceDetector.detectForVideo(bitmap, message.timestampMs)
        : { detections: [] };
      const detections = (result.detections || []).map(item => {
        const category = item.categories && item.categories[0];
        const box = item.boundingBox;
        return {
          label: category && (category.categoryName || category.displayName) || "",
          score: category ? category.score : 0,
          box: box ? {
            x: box.originX,
            y: box.originY,
            width: box.width,
            height: box.height
          } : null
        };
      }).filter(item => item.box);
      const faces = (faceResult.detections || []).map(item => {
        const category = item.categories && item.categories[0];
        const box = item.boundingBox;
        return {
          label: "face",
          score: category ? category.score : 0,
          box: box ? {
            x: box.originX,
            y: box.originY,
            width: box.width,
            height: box.height
          } : null
        };
      }).filter(item => item.box);
      self.postMessage({
        type: "result",
        detections: detections.concat(faces),
        imageWidth: bitmap.width,
        imageHeight: bitmap.height,
        inferenceMs: Math.round(performance.now() - startedAt),
        timestampMs: message.timestampMs
      });
    } catch (error) {
      self.postMessage({
        type: "error",
        fatal: false,
        message: "A frame could not be analysed: " + (error && error.message ? error.message : "unknown error")
      });
    } finally {
      bitmap.close?.();
    }
  }
};
