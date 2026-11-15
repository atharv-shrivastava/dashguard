import java.net.URI
import java.nio.file.Files
import java.nio.file.StandardCopyOption
import java.security.MessageDigest

val assetDirectory = file("src/main/assets")
val modelFile = file("$assetDirectory/efficientdet-lite0.tflite")
val modelUrl = "https://storage.googleapis.com/mediapipe-models/object_detector/efficientdet_lite0/float32/1/efficientdet_lite0.tflite"
val expectedSha256 = "40338edf5ec70d43e318b0a716a84d4564cd1802759a7a07170c7e43796dbf58"

fun File.sha256Hex(): String {
    val digest = MessageDigest.getInstance("SHA-256")
    inputStream().use { input ->
        val buffer = ByteArray(8192)
        while (true) {
            val count = input.read(buffer)
            if (count <= 0) break
            digest.update(buffer, 0, count)
        }
    }
    return digest.digest().joinToString("") { "%02x".format(it) }
}

val downloadAndVerifyDetectorModel = tasks.register("downloadAndVerifyDetectorModel") {
    outputs.file(modelFile)
    outputs.upToDateWhen {
        modelFile.exists() && modelFile.length() > 0L &&
            runCatching { modelFile.sha256Hex() == expectedSha256 }.getOrDefault(false)
    }

    doLast {
        assetDirectory.mkdirs()
        if (!modelFile.exists() ||
            modelFile.length() == 0L ||
            runCatching { modelFile.sha256Hex() != expectedSha256 }.getOrDefault(true)
        ) {
            val temporaryFile = file("$modelFile.tmp")
            try {
                URI(modelUrl).toURL().openStream().use { input ->
                    Files.copy(input, temporaryFile.toPath(), StandardCopyOption.REPLACE_EXISTING)
                }
                val actualSha256 = temporaryFile.sha256Hex()
                if (actualSha256 != expectedSha256) {
                    throw GradleException(
                        "EfficientDet Lite0 checksum mismatch. Expected $expectedSha256 but received $actualSha256."
                    )
                }
                Files.move(
                    temporaryFile.toPath(),
                    modelFile.toPath(),
                    StandardCopyOption.REPLACE_EXISTING,
                )
            } finally {
                temporaryFile.delete()
            }
        }

        if (!modelFile.exists() || modelFile.length() == 0L || modelFile.sha256Hex() != expectedSha256) {
            throw GradleException("Verified EfficientDet Lite0 model is missing or invalid.")
        }
        logger.lifecycle("Verified local detector model: ${modelFile.name}")
    }
}

tasks.named("preBuild").configure {
    dependsOn(downloadAndVerifyDetectorModel)
}
