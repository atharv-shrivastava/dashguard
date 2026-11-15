/* MediaPipe Tasks Vision worker: all model inference stays on this device. */
"use strict";

const MEDIAPIPE_VERSION = "1.2.3";
const MEDIAPIPE_BASE = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@" + MEDIAPIPE_VERSION;
const MODEL_URL = "https://storage.googleapis.com/mediapipe-models/object_detector/efficientdet_lite0/float32/1/efficientdet_lite0.tflite";

let detector = null;
let loading = false;

self.onmessage = async event => {
  const message = event.data || {};
  if (message.type === "init") {
    if (loading || detector) return;
    loading = true;
    try {
      const { FilesetResolver, ObjectDetector } = await import(
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
    detector = null;
    self.close();
    return;
  }

  if (message.type === "frame" && detector && message.bitmap) {
    const bitmap = message.bitmap;
    const startedAt = performance.now();
    try {
      const result = detector.detectForVideo(bitmap, message.timestampMs);
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
      self.postMessage({
        type: "result",
        detections,
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
