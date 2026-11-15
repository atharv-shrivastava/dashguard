/*
 * Detection overlay adapted from the drawing approach in Google's MediaPipe
 * object-detection sample. Original sample is Apache-2.0 licensed.
 */
package com.atharv.dashguard

import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.RectF
import android.util.AttributeSet
import android.view.View
import kotlin.math.min
import kotlin.math.roundToInt

data class DetectionBox(
    val left: Float,
    val top: Float,
    val right: Float,
    val bottom: Float,
    val label: String,
    val score: Float,
)

class DetectionOverlayView @JvmOverloads constructor(
    context: Context,
    attrs: AttributeSet? = null,
) : View(context, attrs) {
    private var boxes: List<DetectionBox> = emptyList()
    private var sourceWidth = 1
    private var sourceHeight = 1

    private val outlinePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = Color.rgb(190, 218, 168)
        style = Paint.Style.STROKE
        strokeWidth = 3f * resources.displayMetrics.density
    }
    private val labelPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = Color.rgb(190, 218, 168)
        style = Paint.Style.FILL
    }
    private val textPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = Color.rgb(31, 43, 35)
        textSize = 11f * resources.displayMetrics.scaledDensity
        typeface = android.graphics.Typeface.create("sans-serif-medium", android.graphics.Typeface.NORMAL)
    }
    private val labelBounds = RectF()
    private val boxBounds = RectF()
    private val density = resources.displayMetrics.density
    private val horizontalPadding = 6f * density
    private val verticalPadding = 4f * density

    fun updateDetections(detections: List<DetectionBox>, imageWidth: Int, imageHeight: Int) {
        boxes = detections
        sourceWidth = imageWidth.coerceAtLeast(1)
        sourceHeight = imageHeight.coerceAtLeast(1)
        invalidate()
    }

    fun clear() {
        boxes = emptyList()
        invalidate()
    }

    override fun onDraw(canvas: Canvas) {
        super.onDraw(canvas)
        if (boxes.isEmpty() || width == 0 || height == 0) return

        // FIT_CENTER mapping matches the PreviewView scale type used by MainActivity.
        val scale = min(width.toFloat() / sourceWidth, height.toFloat() / sourceHeight)
        val offsetX = (width - sourceWidth * scale) / 2f
        val offsetY = (height - sourceHeight * scale) / 2f

        for (box in boxes) {
            val left = offsetX + box.left * scale
            val top = offsetY + box.top * scale
            val right = offsetX + box.right * scale
            val bottom = offsetY + box.bottom * scale
            boxBounds.set(left, top, right, bottom)
            canvas.drawRoundRect(boxBounds, 9f * density, 9f * density, outlinePaint)

            val caption = box.label + " " + (box.score * 100f).roundToInt() + "%"
            val textWidth = textPaint.measureText(caption)
            val labelHeight = textPaint.fontMetrics.run { bottom - top }
            val labelTop = (top - labelHeight - verticalPadding * 2f).coerceAtLeast(0f)
            labelBounds.set(
                left,
                labelTop,
                left + textWidth + horizontalPadding * 2f,
                labelTop + labelHeight + verticalPadding * 2f,
            )
            canvas.drawRoundRect(labelBounds, 6f * density, 6f * density, labelPaint)
            canvas.drawText(
                caption,
                left + horizontalPadding,
                labelTop + verticalPadding - textPaint.fontMetrics.top,
                textPaint,
            )
        }
    }
}
