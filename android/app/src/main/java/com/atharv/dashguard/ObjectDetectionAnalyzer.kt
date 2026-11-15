/*
 * Adapted from Google's MediaPipe Android object-detection sample.
 * Copyright 2022 The TensorFlow Authors. Licensed under Apache-2.0.
 * https://github.com/google-ai-edge/mediapipe-samples/tree/main/examples/object_detection/android
 */
package com.atharv.dashguard

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Matrix
import android.os.SystemClock
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.ImageProxy
import com.google.mediapipe.framework.image.BitmapImageBuilder
import com.google.mediapipe.framework.image.MPImage
import com.google.mediapipe.tasks.core.BaseOptions
import com.google.mediapipe.tasks.core.Delegate
import com.google.mediapipe.tasks.vision.core.RunningMode
import com.google.mediapipe.tasks.vision.objectdetector.ObjectDetector
import com.google.mediapipe.tasks.vision.objectdetector.ObjectDetectorResult
import java.util.Locale
import java.util.concurrent.atomic.AtomicBoolean

/**
 * Owns one on-device MediaPipe detector and consumes CameraX frames.
 *
 * CameraX calls analyze() on the single-thread executor supplied by MainActivity.
 * Input frames are sampled to avoid queuing inference work on slower phones.
 */
class ObjectDetectionAnalyzer(
    context: Context,
    private val onResults: (List<DetectionBox>, Int, Int, Long) -> Unit,
    private val onError: (String) -> Unit,
) : ImageAnalysis.Analyzer, AutoCloseable {

    private val closed = AtomicBoolean(false)
    private var lastSubmittedAtMs = 0L

    private val detector: ObjectDetector

    init {
        val baseOptions = BaseOptions.builder()
            .setModelAssetPath(MODEL_ASSET)
            .setDelegate(Delegate.CPU)
            .build()

        val options = ObjectDetector.ObjectDetectorOptions.builder()
            .setBaseOptions(baseOptions)
            .setScoreThreshold(SCORE_THRESHOLD)
            .setMaxResults(MAX_RESULTS)
            .setRunningMode(RunningMode.LIVE_STREAM)
            .setResultListener(this::handleResult)
            .setErrorListener { error ->
                if (!closed.get()) {
                    onError(error.message ?: "The on-device detector reported an error.")
                }
            }
            .build()

        detector = ObjectDetector.createFromOptions(context.applicationContext, options)
    }

    override fun analyze(imageProxy: ImageProxy) {
        if (closed.get()) {
            imageProxy.close()
            return
        }

        val frameTimeMs = SystemClock.uptimeMillis()
        if (frameTimeMs - lastSubmittedAtMs < MIN_FRAME_INTERVAL_MS) {
            imageProxy.close()
            return
        }
        lastSubmittedAtMs = frameTimeMs

        var sourceBitmap: Bitmap? = null
        var rotatedBitmap: Bitmap? = null
        var proxyClosed = false

        try {
            val width = imageProxy.width
            val height = imageProxy.height
            sourceBitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)

            val buffer = imageProxy.planes.first().buffer
            buffer.rewind()
            sourceBitmap.copyPixelsFromBuffer(buffer)

            val rotationDegrees = imageProxy.imageInfo.rotationDegrees
            imageProxy.close()
            proxyClosed = true

            val transform = Matrix().apply {
                postRotate(rotationDegrees.toFloat())
            }
            rotatedBitmap = Bitmap.createBitmap(
                sourceBitmap,
                0,
                0,
                sourceBitmap.width,
                sourceBitmap.height,
                transform,
                true,
            )

            if (rotatedBitmap !== sourceBitmap) {
                sourceBitmap.recycle()
                sourceBitmap = null
            }

            val inputImage = BitmapImageBuilder(rotatedBitmap).build()
            try {
                detector.detectAsync(inputImage, frameTimeMs)
                // The callback owns inputImage until it closes it in handleResult().
                rotatedBitmap = null
            } catch (error: RuntimeException) {
                inputImage.close()
                throw error
            }
        } catch (error: Exception) {
            if (!proxyClosed) imageProxy.close()
            sourceBitmap?.takeIf { !it.isRecycled }?.recycle()
            rotatedBitmap?.takeIf { !it.isRecycled }?.recycle()
            if (!closed.get()) {
                onError("Frame analysis failed: " + (error.message ?: error.javaClass.simpleName))
            }
        }
    }

    private fun handleResult(result: ObjectDetectorResult, inputImage: MPImage) {
        try {
            if (closed.get()) return

            val relevantDetections = result.detections().mapNotNull { detection ->
                val category = detection.categories().maxByOrNull { it.score() }
                    ?: return@mapNotNull null
                val label = category.categoryName()
                    ?.trim()
                    ?.takeIf { it.isNotEmpty() }
                    ?: "object"

                if (label.lowercase(Locale.US) !in RELEVANT_CLASSES) {
                    return@mapNotNull null
                }

                val bounds = detection.boundingBox()
                DetectionBox(
                    left = bounds.left,
                    top = bounds.top,
                    right = bounds.right,
                    bottom = bounds.bottom,
                    label = label,
                    score = category.score(),
                )
            }

            val inferenceMs = (SystemClock.uptimeMillis() - result.timestampMs()).coerceAtLeast(0L)
            onResults(relevantDetections, inputImage.width, inputImage.height, inferenceMs)
        } catch (error: Exception) {
            if (!closed.get()) {
                onError("Could not render detection results: " + (error.message ?: "unknown error"))
            }
        } finally {
            inputImage.close()
        }
    }

    override fun close() {
        if (closed.compareAndSet(false, true)) {
            detector.close()
        }
    }

    companion object {
        private const val MODEL_ASSET = "efficientdet-lite0.tflite"
        private const val SCORE_THRESHOLD = 0.40f
        private const val MAX_RESULTS = 20
        private const val MIN_FRAME_INTERVAL_MS = 160L

        private val RELEVANT_CLASSES = setOf(
            "person",
            "bicycle",
            "car",
            "motorcycle",
            "bus",
            "train",
            "truck",
        )
    }
}
