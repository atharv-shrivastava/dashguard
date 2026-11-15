/*
 * DashGuard Android object-detection prototype.
 * CameraX preview and analysis are bound in one lifecycle-owned camera session.
 */
package com.atharv.dashguard

import android.Manifest
import android.content.pm.PackageManager
import android.os.Bundle
import android.util.Log
import android.view.View
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView
import androidx.activity.ComponentActivity
import androidx.activity.result.contract.ActivityResultContracts
import androidx.camera.core.AspectRatio
import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.Preview
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.core.content.ContextCompat
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors

class MainActivity : ComponentActivity() {
    private lateinit var previewView: PreviewView
    private lateinit var overlayView: DetectionOverlayView
    private lateinit var placeholder: LinearLayout
    private lateinit var statusText: TextView
    private lateinit var objectCountText: TextView
    private lateinit var inferenceText: TextView
    private lateinit var toggleButton: Button

    private val analysisExecutor: ExecutorService = Executors.newSingleThreadExecutor()
    private var cameraProvider: ProcessCameraProvider? = null
    private var detector: ObjectDetectionAnalyzer? = null
    private var isStarting = false
    private var isCameraRunning = false
    private var destroyed = false

    private val cameraPermissionLauncher =
        registerForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
            if (granted) {
                beginDetection()
            } else {
                setStatus("CAMERA PERMISSION REQUIRED")
                toggleButton.isEnabled = true
            }
        }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        previewView = findViewById(R.id.previewView)
        overlayView = findViewById(R.id.overlayView)
        placeholder = findViewById(R.id.cameraPlaceholder)
        statusText = findViewById(R.id.statusText)
        objectCountText = findViewById(R.id.objectCountText)
        inferenceText = findViewById(R.id.inferenceText)
        toggleButton = findViewById(R.id.toggleDetectionButton)

        previewView.scaleType = PreviewView.ScaleType.FIT_CENTER
        previewView.implementationMode = PreviewView.ImplementationMode.COMPATIBLE

        toggleButton.setOnClickListener {
            if (isStarting || isCameraRunning) {
                stopDetection()
            } else {
                val granted = ContextCompat.checkSelfPermission(
                    this,
                    Manifest.permission.CAMERA,
                ) == PackageManager.PERMISSION_GRANTED

                if (granted) beginDetection()
                else cameraPermissionLauncher.launch(Manifest.permission.CAMERA)
            }
        }
    }

    private fun beginDetection() {
        if (isStarting || isCameraRunning || destroyed) return

        isStarting = true
        toggleButton.isEnabled = false
        setStatus("LOADING LOCAL DETECTOR…")
        objectCountText.text = "Preparing object detection"
        inferenceText.text = "— ms"

        // Model initialization is kept off the UI thread. This same serial executor
        // later receives CameraX frames and submits them to MediaPipe.
        analysisExecutor.execute {
            val createdDetector = try {
                ObjectDetectionAnalyzer(
                    context = applicationContext,
                    onResults = { boxes, imageWidth, imageHeight, inferenceMs ->
                        runOnUiThread {
                            if (destroyed || (!isStarting && !isCameraRunning)) return@runOnUiThread
                            overlayView.updateDetections(boxes, imageWidth, imageHeight)
                            objectCountText.text = boxes.size.toString() + " relevant objects"
                            inferenceText.text = inferenceMs.toString() + " ms"
                            setStatus("LIVE DETECTION · ON DEVICE")
                        }
                    },
                    onError = { message ->
                        runOnUiThread {
                            if (!destroyed && (isStarting || isCameraRunning)) {
                                setStatus("DETECTOR NOTICE · " + message)
                            }
                        }
                    },
                )
            } catch (error: Exception) {
                runOnUiThread {
                    if (!destroyed) {
                        isStarting = false
                        toggleButton.isEnabled = true
                        toggleButton.text = "RETRY DETECTION"
                        setStatus("MODEL INITIALIZATION FAILED")
                        objectCountText.text = error.message ?: "Could not load local model"
                    }
                }
                null
            }

            if (createdDetector != null) {
                runOnUiThread {
                    if (destroyed || !isStarting) {
                        createdDetector.close()
                    } else {
                        detector = createdDetector
                        bindCamera(createdDetector)
                    }
                }
            }
        }
    }

    @Suppress("DEPRECATION")
    private fun bindCamera(activeDetector: ObjectDetectionAnalyzer) {
        val cameraFuture = ProcessCameraProvider.getInstance(this)
        cameraFuture.addListener({
            if (destroyed || !isStarting) return@addListener

            try {
                val provider = cameraFuture.get()
                cameraProvider = provider

                val preview = Preview.Builder()
                    .setTargetAspectRatio(AspectRatio.RATIO_4_3)
                    .build()
                    .also { it.setSurfaceProvider(previewView.surfaceProvider) }

                val analysis = ImageAnalysis.Builder()
                    .setTargetAspectRatio(AspectRatio.RATIO_4_3)
                    .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
                    .setOutputImageFormat(ImageAnalysis.OUTPUT_IMAGE_FORMAT_RGBA_8888)
                    .build()
                    .also { it.setAnalyzer(analysisExecutor, activeDetector) }

                provider.unbindAll()
                provider.bindToLifecycle(
                    this,
                    CameraSelector.DEFAULT_BACK_CAMERA,
                    preview,
                    analysis,
                )

                isStarting = false
                isCameraRunning = true
                previewView.visibility = View.VISIBLE
                placeholder.visibility = View.GONE
                toggleButton.isEnabled = true
                toggleButton.text = "STOP DETECTION"
                setStatus("LIVE DETECTION · ON DEVICE")
            } catch (error: Exception) {
                Log.e(TAG, "Could not bind the CameraX pipeline", error)
                failStart("Could not open rear camera: " + (error.message ?: "unknown error"))
            }
        }, ContextCompat.getMainExecutor(this))
    }

    private fun failStart(message: String) {
        isStarting = false
        isCameraRunning = false
        cameraProvider?.unbindAll()
        cameraProvider = null

        val oldDetector = detector
        detector = null
        if (oldDetector != null && !analysisExecutor.isShutdown) {
            analysisExecutor.execute { oldDetector.close() }
        }

        previewView.visibility = View.INVISIBLE
        placeholder.visibility = View.VISIBLE
        overlayView.clear()
        toggleButton.isEnabled = true
        toggleButton.text = "RETRY DETECTION"
        setStatus("CAMERA UNAVAILABLE")
        objectCountText.text = message
        inferenceText.text = "— ms"
    }

    private fun stopDetection() {
        isStarting = false
        isCameraRunning = false
        cameraProvider?.unbindAll()
        cameraProvider = null

        val oldDetector = detector
        detector = null
        if (oldDetector != null) {
            if (!analysisExecutor.isShutdown) {
                analysisExecutor.execute { oldDetector.close() }
            } else {
                oldDetector.close()
            }
        }

        previewView.visibility = View.INVISIBLE
        placeholder.visibility = View.VISIBLE
        overlayView.clear()
        toggleButton.isEnabled = true
        toggleButton.text = "START DETECTION"
        objectCountText.text = "0 relevant objects"
        inferenceText.text = "— ms"
        setStatus("CAMERA OFF")
    }

    private fun setStatus(message: String) {
        statusText.text = message
    }

    override fun onStop() {
        if (isStarting || isCameraRunning || detector != null) {
            stopDetection()
        }
        super.onStop()
    }

    override fun onDestroy() {
        destroyed = true
        stopDetection()
        analysisExecutor.shutdown()
        super.onDestroy()
    }

    companion object {
        private const val TAG = "DashGuardCamera"
    }
}
