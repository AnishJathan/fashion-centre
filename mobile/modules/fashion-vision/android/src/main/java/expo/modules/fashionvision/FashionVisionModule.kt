package expo.modules.fashionvision

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Matrix
import android.net.Uri
import androidx.exifinterface.media.ExifInterface
import com.google.android.gms.tasks.Tasks
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.pose.PoseDetection
import com.google.mlkit.vision.pose.PoseLandmark
import com.google.mlkit.vision.pose.accurate.AccuratePoseDetectorOptions
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.functions.Coroutine
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import java.io.File
import kotlin.math.max
import kotlin.math.roundToInt

class FashionVisionModule : Module() {
  private val analysisLock = Mutex()

  override fun definition() = ModuleDefinition {
    Name("FashionVision")
    AsyncFunction("analyze") Coroutine { uri: String, sampleSide: Int ->
      // Serialize native allocations, away from UI and JS threads. Tasks.await keeps
      // the input bitmap alive until inference completes, even if JS goes away.
      withContext(Dispatchers.IO) {
        analysisLock.withLock {
          try {
            analyzeLocal(uri, sampleSide)
          } catch (error: CodedException) {
            throw error
          } catch (error: Exception) {
            // Do not expose local paths, image metadata or native exception details.
            throw CodedException("ERR_FASHION_VISION", "Could not analyze this photo. Try another image.", null)
          }
        }
      }
    }
  }

  private fun fail(code: String, message: String): Nothing = throw CodedException(code, message, null)

  private fun readLocalImage(value: String): ByteArray {
    val context = appContext.reactContext
      ?: fail("ERR_CONTEXT_LOST", "Photo analysis is unavailable. Reopen the app.")
    val uri = Uri.parse(value)
    if (uri.scheme != null && uri.scheme != "file") {
      fail("ERR_IMAGE_URI", "Select a photo copied into this app's local storage.")
    }
    if (!uri.authority.isNullOrEmpty() || uri.query != null || uri.fragment != null) {
      fail("ERR_IMAGE_URI", "The photo location is not supported.")
    }
    val path = if (uri.scheme == null) value else uri.path ?: ""
    val input = File(path)
    if (!input.isAbsolute) fail("ERR_IMAGE_URI", "The photo location must be local and absolute.")
    val file = input.canonicalFile
    val roots = listOf(context.cacheDir, context.filesDir).map { it.canonicalFile.path + File.separator }
    if (roots.none { file.path.startsWith(it) } || !file.isFile) {
      fail("ERR_IMAGE_URI", "Select a photo copied into this app's local storage.")
    }
    val maxBytes = 10 * 1024 * 1024
    if (file.length() !in 1..maxBytes.toLong()) fail("ERR_IMAGE_SIZE", "Use a photo no larger than 10 MiB.")
    // Stable bounded bytes shared by EXIF, bounds and decode; never load a URI via a provider.
    return file.inputStream().use { stream ->
      val output = ByteArrayOutputStream()
      val buffer = ByteArray(8192)
      var total = 0
      while (true) {
        val count = stream.read(buffer)
        if (count == -1) break
        total += count
        if (total > maxBytes) fail("ERR_IMAGE_SIZE", "Use a photo no larger than 10 MiB.")
        output.write(buffer, 0, count)
      }
      output.toByteArray()
    }
  }

  private fun analyzeLocal(uri: String, sampleSide: Int): Map<String, Any> {
    if (sampleSide != 320 && sampleSide != 512) fail("ERR_SAMPLE_SIZE", "Sample side must be 320 or 512.")
    val bytes = readLocalImage(uri)
    val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
    BitmapFactory.decodeByteArray(bytes, 0, bytes.size, bounds)
    val width = bounds.outWidth
    val height = bounds.outHeight
    if (width < 3 || height < 3 || width > 12000 || height > 12000 || width.toLong() * height > 40_000_000L) {
      fail("ERR_IMAGE_DIMENSIONS", "Use a readable image up to 40 megapixels and 12000 pixels per side.")
    }
    val orientation = ByteArrayInputStream(bytes).use {
      ExifInterface(it).getAttributeInt(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL)
    }
    val swapsAxes = orientation in 5..8
    val owned = mutableListOf<Bitmap>()
    fun own(bitmap: Bitmap): Bitmap { if (owned.none { it === bitmap }) owned.add(bitmap); return bitmap }
    try {
      var sample = 1
      while (max(width, height) / (sample * 2) >= 1280) sample *= 2
      val options = BitmapFactory.Options().apply {
        inSampleSize = sample
        inPreferredConfig = Bitmap.Config.ARGB_8888
      }
      val decoded = own(BitmapFactory.decodeByteArray(bytes, 0, bytes.size, options)
        ?: fail("ERR_IMAGE_DECODE", "This photo could not be decoded."))
      val transform = Matrix().apply {
        when (orientation) {
          2 -> setScale(-1f, 1f)
          3 -> setRotate(180f)
          4 -> setScale(1f, -1f)
          5 -> { setRotate(90f); postScale(-1f, 1f) }
          6 -> setRotate(90f)
          7 -> { setRotate(90f); postScale(1f, -1f) }
          8 -> setRotate(270f)
        }
      }
      val oriented = own(Bitmap.createBitmap(decoded, 0, 0, decoded.width, decoded.height, transform, true))
      fun scaled(source: Bitmap, side: Int): Bitmap {
        val scale = minOf(1.0, side.toDouble() / max(source.width, source.height))
        return own(Bitmap.createScaledBitmap(source, max(1, (source.width * scale).roundToInt()),
          max(1, (source.height * scale).roundToInt()), true))
      }
      val quality = scaled(oriented, sampleSide)
      if (quality.width < 3 || quality.height < 3) fail("ERR_IMAGE_DIMENSIONS", "The photo is too narrow to analyze.")
      val pixels = IntArray(quality.width * quality.height)
      quality.getPixels(pixels, 0, quality.width, 0, 0, quality.width, quality.height)
      val metrics = QualityMetrics.analyze(pixels, quality.width, quality.height)
      val poseImage = scaled(oriented, 1280)
      val detector = PoseDetection.getClient(AccuratePoseDetectorOptions.Builder()
        .setDetectorMode(AccuratePoseDetectorOptions.SINGLE_IMAGE_MODE).build())
      val landmarks = try {
        val pose = Tasks.await(detector.process(InputImage.fromBitmap(poseImage, 0)))
        LANDMARKS.mapNotNull { (name, type) ->
          pose.getPoseLandmark(type)?.let { point ->
            mapOf("name" to name, "x" to point.position.x.toDouble() / poseImage.width,
              "y" to point.position.y.toDouble() / poseImage.height,
              "confidence" to point.inFrameLikelihood.toDouble())
          }
        }
      } finally { detector.close() }
      return mapOf("width" to if (swapsAxes) height else width,
        "height" to if (swapsAxes) width else height,
        "brightness" to metrics[0], "sharpness" to metrics[1],
        "landmarks" to landmarks, "engine" to "mlkit-accurate-18.0.0-beta5")
    } finally {
      owned.forEach { if (!it.isRecycled) it.recycle() }
    }
  }

  companion object {
    private val LANDMARKS = listOf("nose" to PoseLandmark.NOSE,
      "leftShoulder" to PoseLandmark.LEFT_SHOULDER, "rightShoulder" to PoseLandmark.RIGHT_SHOULDER,
      "leftHip" to PoseLandmark.LEFT_HIP, "rightHip" to PoseLandmark.RIGHT_HIP,
      "leftKnee" to PoseLandmark.LEFT_KNEE, "rightKnee" to PoseLandmark.RIGHT_KNEE,
      "leftAnkle" to PoseLandmark.LEFT_ANKLE, "rightAnkle" to PoseLandmark.RIGHT_ANKLE)
  }
}
