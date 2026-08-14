package expo.modules.quaddetect

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.Promise

import ai.onnxruntime.OnnxTensor
import ai.onnxruntime.OrtEnvironment
import ai.onnxruntime.OrtSession

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Matrix
import android.graphics.Paint
import android.graphics.Path
import android.util.Base64
import android.util.Log

import java.io.File
import java.io.FileOutputStream
import java.net.URLDecoder
import java.nio.ByteBuffer
import java.nio.ByteOrder

class QuadDetectModule : Module() {

    private val TAG = "QuadDetect"

    private var env: OrtEnvironment? = null
    private var session: OrtSession? = null

    private fun ensureSession() {
        if (session != null) return

        val ctx = appContext.reactContext
            ?: throw Exception("No React context")

        env = OrtEnvironment.getEnvironment()

        val modelBytes =
            ctx.assets.open("reel.onnx").use {
                it.readBytes()
            }

        Log.d(
            TAG,
            "asset reel.onnx bytes=${modelBytes.size}"
        )

        val opts = OrtSession.SessionOptions()

        opts.setOptimizationLevel(
            OrtSession.SessionOptions.OptLevel.NO_OPT
        )

        session = env!!.createSession(
            modelBytes,
            opts
        )

        Log.d(
            TAG,
            "ONNX session loaded; " +
                "inputs=${session!!.inputNames.joinToString(",")} " +
                "outputs=${session!!.outputNames.joinToString(",")}"
        )
    }

    override fun definition() = ModuleDefinition {

        Name("QuadDetect")

        // ============================================================
        // QUAD DETECTION
        // ============================================================

        AsyncFunction("detectQuad") {
            uri: String,
            guess: List<Double>?,
            promise: Promise ->

            try {

                Log.d(
                    TAG,
                    "detectQuad called uri=${uri.take(100)}"
                )

                ensureSession()

                val ctx =
                    appContext.reactContext
                        ?: throw Exception(
                            "No React context"
                        )

                val bmp =
                    loadBitmap(ctx, uri)
                        ?: throw Exception(
                            "Could not load image"
                        )

                Log.d(
                    TAG,
                    "bitmap loaded ${bmp.width}x${bmp.height}"
                )

                // ONNX input.
                val scaled =
                    Bitmap.createScaledBitmap(
                        bmp,
                        512,
                        512,
                        true
                    )

                val pixels =
                    IntArray(512 * 512)

                scaled.getPixels(
                    pixels,
                    0,
                    512,
                    0,
                    0,
                    512,
                    512
                )

                val plane =
                    512 * 512

                val tensor =
                    FloatArray(3 * plane)

                for (i in pixels.indices) {

                    val p = pixels[i]

                    tensor[i] =
                        (p and 0xFF) / 255.0f

                    tensor[plane + i] =
                        ((p shr 8) and 0xFF) / 255.0f

                    tensor[2 * plane + i] =
                        ((p shr 16) and 0xFF) / 255.0f
                }

                var mn = Float.MAX_VALUE
                var mx = -Float.MAX_VALUE
                var sum = 0.0

                for (v in tensor) {

                    if (v < mn) mn = v
                    if (v > mx) mx = v

                    sum += v
                }

                Log.d(
                    TAG,
                    "tensor min=$mn max=$mx " +
                        "mean=${sum / tensor.size}"
                )

                val byteBuffer =
                    ByteBuffer
                        .allocateDirect(
                            tensor.size * 4
                        )
                        .order(
                            ByteOrder.nativeOrder()
                        )

                val floatBuffer =
                    byteBuffer.asFloatBuffer()

                floatBuffer.put(tensor)
                floatBuffer.rewind()

                val inputName =
                    session!!.inputNames.first()

                val inputTensor =
                    OnnxTensor.createTensor(
                        env!!,
                        floatBuffer,
                        longArrayOf(
                            1,
                            3,
                            512,
                            512
                        )
                    )

                val result =
                    session!!.run(
                        mapOf(
                            inputName to inputTensor
                        )
                    )

                inputTensor.close()

                val onnxValue =
                    result.get(0)

                val batch =
                    onnxValue.value
                        as Array<Array<FloatArray>>

                val rawCorners =
                    batch[0]

                Log.d(
                    TAG,
                    "raw=" +
                        rawCorners.joinToString(" ") {
                            c ->
                            "[%.4f,%.4f]".format(
                                c[0],
                                c[1]
                            )
                        }
                )

                result.close()

                val out =
                    rawCorners.map { c ->

                        mapOf(
                            "x" to (
                                c[0] *
                                    bmp.width
                            ).toDouble(),

                            "y" to (
                                c[1] *
                                    bmp.height
                            ).toDouble()
                        )
                    }

                Log.d(
                    TAG,
                    "result=" +
                        out.joinToString(" ") {
                            p ->
                            "(${(p["x"] as Double).toInt()}," +
                                "${(p["y"] as Double).toInt()})"
                        }
                )

                promise.resolve(out)

            } catch (e: Exception) {

                Log.e(
                    TAG,
                    "detectQuad error",
                    e
                )

                promise.reject(
                    "ERR_DETECT",
                    e.message,
                    e
                )
            }
        }

        // ============================================================
        // PERSPECTIVE WARP
        // ============================================================

        AsyncFunction("warpQuad") {
            uri: String,
            flat: List<Double>,
            outW: Int,
            outH: Int,
            flipV: Boolean,
            promise: Promise ->

            try {

                val ctx =
                    appContext.reactContext
                        ?: throw Exception(
                            "No React context"
                        )

                if (flat.size != 8) {
                    throw Exception(
                        "warpQuad needs 8 doubles"
                    )
                }

                val bmp =
                    loadBitmap(ctx, uri)
                        ?: throw Exception(
                            "Could not load warp source image"
                        )

                Log.d(
                    TAG,
                    "warpQuad source=${bmp.width}x${bmp.height} " +
                        "out=${outW}x${outH} " +
                        "flipV=$flipV"
                )

                /*
                 * Incoming normalized coordinates are:
                 *
                 * [TL, TR, BR, BL]
                 *
                 * in Android image coordinates:
                 *
                 * x → right
                 * y → down
                 */
                val src =
                    FloatArray(8) { i ->

                        if (i % 2 == 0) {
                            (
                                flat[i] *
                                    bmp.width
                            ).toFloat()
                        } else {
                            (
                                flat[i] *
                                    bmp.height
                            ).toFloat()
                        }
                    }

                /*
                 * Destination is a true physical rectangle:
                 *
                 * TL → (0,0)
                 * TR → (outW,0)
                 * BR → (outW,outH)
                 * BL → (0,outH)
                 */
                val dst =
                    floatArrayOf(
                        0f,
                        0f,

                        outW.toFloat(),
                        0f,

                        outW.toFloat(),
                        outH.toFloat(),

                        0f,
                        outH.toFloat()
                    )

                val matrix =
                    Matrix()

                val success =
                    matrix.setPolyToPoly(
                        src,
                        0,
                        dst,
                        0,
                        4
                    )

                if (!success) {
                    throw Exception(
                        "setPolyToPoly failed"
                    )
                }

                /*
                 * THIS IS THE CRITICAL FIX.
                 *
                 * The old implementation did:
                 *
                 *   Canvas(out).drawBitmap(bmp, matrix, null)
                 *
                 * which transforms the ENTIRE photograph.
                 *
                 * That means pixels outside the VHS quad can become
                 * part of the output texture.
                 *
                 * We instead:
                 *
                 *   1. Transform the Canvas.
                 *   2. Clip the Canvas to the ORIGINAL detected quad.
                 *   3. Draw the source bitmap.
                 *
                 * Because the quad is transformed onto the exact output
                 * rectangle, only pixels belonging to the detected face
                 * can enter the resulting texture.
                 */
                var out =
                    Bitmap.createBitmap(
                        outW,
                        outH,
                        Bitmap.Config.ARGB_8888
                    )

                val canvas =
                    Canvas(out)

                val paint =
                    Paint(
                        Paint.ANTI_ALIAS_FLAG or
                            Paint.FILTER_BITMAP_FLAG
                    )

                val sourcePath =
                    Path()

                sourcePath.moveTo(
                    src[0],
                    src[1]
                )

                sourcePath.lineTo(
                    src[2],
                    src[3]
                )

                sourcePath.lineTo(
                    src[4],
                    src[5]
                )

                sourcePath.lineTo(
                    src[6],
                    src[7]
                )

                sourcePath.close()

                canvas.save()

                /*
                 * Apply the perspective transform first.
                 * The source quad now maps exactly onto the destination.
                 */
                canvas.concat(matrix)

                /*
                 * Clip to the original VHS face.
                 *
                 * Because the clip is evaluated under the same transform,
                 * the four source corners become the four edges of the
                 * output rectangle.
                 */
                canvas.clipPath(
                    sourcePath
                )

                /*
                 * Draw the source at identity coordinates.
                 * The Canvas transform handles the perspective warp.
                 */
                canvas.drawBitmap(
                    bmp,
                    0f,
                    0f,
                    paint
                )

                canvas.restore()

                /*
                 * Optional native vertical correction.
                 *
                 * The current JS viewer intentionally passes false and
                 * performs the final V correction in Three.js. This remains
                 * here so the native API remains compatible.
                 */
                if (flipV) {

                    val flipMatrix =
                        Matrix()

                    flipMatrix.preScale(
                        1f,
                        -1f
                    )

                    flipMatrix.postTranslate(
                        0f,
                        outH.toFloat()
                    )

                    val flipped =
                        Bitmap.createBitmap(
                            outW,
                            outH,
                            Bitmap.Config.ARGB_8888
                        )

                    val flipCanvas =
                        Canvas(flipped)

                    flipCanvas.drawBitmap(
                        out,
                        flipMatrix,
                        paint
                    )

                    out.recycle()

                    out = flipped
                }

                /*
                 * PNG is intentional.
                 *
                 * These are texture assets, not photographs for display.
                 * PNG avoids JPEG compression around the exact quad boundary.
                 */
                val file =
                    File(
                        ctx.cacheDir,
                        "warp_${System.currentTimeMillis()}_" +
                            "${(Math.random() * 1e6).toInt()}.png"
                    )

                FileOutputStream(file).use { fos ->

                    out.compress(
                        Bitmap.CompressFormat.PNG,
                        100,
                        fos
                    )
                }

                Log.d(
                    TAG,
                    "warpQuad SUCCESS " +
                        "${bmp.width}x${bmp.height} -> " +
                        "${outW}x${outH} " +
                        "file=${file.name}"
                )

                out.recycle()
                bmp.recycle()

                promise.resolve(
                    mapOf(
                        "uri" to
                            ("file://" + file.absolutePath),

                        "width" to outW,

                        "height" to outH
                    )
                )

            } catch (e: Exception) {

                Log.e(
                    TAG,
                    "warpQuad error",
                    e
                )

                promise.reject(
                    "ERR_WARP",
                    e.message,
                    e
                )
            }
        }
    }

    // ================================================================
    // BITMAP LOADER
    // ================================================================

    private fun loadBitmap(
        ctx: android.content.Context,
        uriString: String
    ): Bitmap? {

        return try {

            /*
             * IMPORTANT:
             *
             * ReelScan currently creates:
             *
             * data:image/jpeg;base64,...
             *
             * so the native module must explicitly understand data URIs.
             */
            if (
                uriString.startsWith(
                    "data:",
                    ignoreCase = true
                )
            ) {

                return decodeDataUri(
                    uriString
                )
            }

            val u =
                android.net.Uri.parse(
                    uriString
                )

            when (u.scheme?.lowercase()) {

                "file",
                null -> {

                    val path =
                        if (
                            u.scheme == null
                        ) {
                            uriString
                        } else {
                            u.path
                                ?: return null
                        }

                    BitmapFactory.decodeFile(
                        path
                    )
                }

                "content" -> {

                    ctx.contentResolver
                        .openInputStream(u)
                        ?.use { stream ->
                            BitmapFactory.decodeStream(
                                stream
                            )
                        }
                }

                else -> {

                    /*
                     * Last attempt for URI types Android's resolver
                     * may understand.
                     */
                    ctx.contentResolver
                        .openInputStream(u)
                        ?.use { stream ->
                            BitmapFactory.decodeStream(
                                stream
                            )
                        }
                }
            }

        } catch (e: Exception) {

            Log.e(
                TAG,
                "loadBitmap failed: ${e.message}",
                e
            )

            null
        }
    }

    private fun decodeDataUri(
        dataUri: String
    ): Bitmap? {

        return try {

            val comma =
                dataUri.indexOf(',')

            if (comma < 0) {
                return null
            }

            val header =
                dataUri.substring(
                    0,
                    comma
                )

            val payload =
                dataUri.substring(
                    comma + 1
                )

            val bytes: ByteArray

            if (
                header.contains(
                    ";base64",
                    ignoreCase = true
                )
            ) {

                bytes =
                    Base64.decode(
                        payload,
                        Base64.DEFAULT
                    )

            } else {

                val decoded =
                    URLDecoder.decode(
                        payload,
                        "UTF-8"
                    )

                bytes =
                    decoded.toByteArray(
                        Charsets.UTF_8
                    )
            }

            BitmapFactory.decodeByteArray(
                bytes,
                0,
                bytes.size
            )

        } catch (e: Exception) {

            Log.e(
                TAG,
                "decodeDataUri failed",
                e
            )

            null
        }
    }
}