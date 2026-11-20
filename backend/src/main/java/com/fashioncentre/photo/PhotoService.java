package com.fashioncentre.photo;

import java.awt.Color;
import java.awt.Graphics2D;
import java.awt.RenderingHints;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.time.Instant;
import java.util.Iterator;

import javax.imageio.IIOImage;
import javax.imageio.IIOException;
import javax.imageio.ImageIO;
import javax.imageio.ImageReader;
import javax.imageio.ImageWriteParam;
import javax.imageio.ImageWriter;
import javax.imageio.stream.ImageOutputStream;
import javax.imageio.stream.MemoryCacheImageInputStream;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

import com.fashioncentre.auth.User;
import com.fashioncentre.auth.UserRepository;

import lombok.RequiredArgsConstructor;
import software.amazon.awssdk.core.sync.RequestBody;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.PutObjectRequest;

import static com.fashioncentre.photo.PhotoStorage.MAX_PHOTO_BYTES;

@Service
@RequiredArgsConstructor
public class PhotoService {

    private static final int MAX_EDGE = 12_000;
    private static final long MAX_PIXELS = 40_000_000;
    private static final int MIN_HEIGHT = 1000;
    private static final int TARGET_HEIGHT = 2000;
    private static final float JPEG_QUALITY = 0.92f;

    private final S3Client s3;
    private final UserRepository users;

    @Value("${r2.bucket}")
    private String bucket;

    @Transactional
    public void saveUserPhoto(User user, MultipartFile file) throws IOException {
        if (file.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "No photo received.");
        }
        if (file.getSize() > MAX_PHOTO_BYTES) {
            throw new ResponseStatusException(HttpStatus.PAYLOAD_TOO_LARGE, "The photo must be 10 MB or smaller.");
        }

        byte[] jpeg = normalize(file.getBytes());

        String key = "users/" + user.getId() + "/photo";
        s3.putObject(
                PutObjectRequest.builder()
                        .bucket(bucket)
                        .key(key)
                        .contentType("image/jpeg")
                        .build(),
                RequestBody.fromBytes(jpeg));

        user.setPhotoPublicId(key);
        user.setPhotoUpdatedAt(Instant.now());
        users.save(user);
    }

    private static byte[] normalize(byte[] original) throws IOException {
        try (var input = new MemoryCacheImageInputStream(new ByteArrayInputStream(original))) {
            Iterator<ImageReader> readers = ImageIO.getImageReaders(input);
            if (!readers.hasNext()) throw unsupportedPhoto();
            ImageReader reader = readers.next();
            try {
                String format = reader.getFormatName();
                if (!format.equalsIgnoreCase("JPEG") && !format.equalsIgnoreCase("PNG")) throw unsupportedPhoto();
                reader.setInput(input, true, true);
                int width = reader.getWidth(0);
                int height = reader.getHeight(0);
                validateDimensions(width, height);

                var parameters = reader.getDefaultReadParam();
                int sample = Math.max(1, height / TARGET_HEIGHT);
                parameters.setSourceSubsampling(sample, sample, 0, 0);
                return encodeJpeg(resize(reader.read(0, parameters), width, height));
            } catch (IIOException ex) {
                throw unsupportedPhoto();
            } finally {
                reader.dispose();
            }
        }
    }

    private static ResponseStatusException unsupportedPhoto() {
        return new ResponseStatusException(HttpStatus.UNSUPPORTED_MEDIA_TYPE, "Use a valid JPEG or PNG photo.");
    }

    private static void validateDimensions(int width, int height) {
        if (width <= 0 || height < MIN_HEIGHT || height <= width) {
            throw new ResponseStatusException(HttpStatus.UNPROCESSABLE_ENTITY,
                    "Use a tall photo held upright, at least " + MIN_HEIGHT + " px high.");
        }
        if (width > MAX_EDGE || height > MAX_EDGE || (long) width * height > MAX_PIXELS) {
            throw new ResponseStatusException(HttpStatus.UNPROCESSABLE_ENTITY,
                    "The photo must be at most 12,000 pixels per edge and 40 megapixels.");
        }
    }

    private static BufferedImage resize(BufferedImage source, int width, int height) {
        int newH = Math.min(height, TARGET_HEIGHT);
        int newW = Math.max(1, Math.round(width * newH / (float) height));

        // Fill PNG transparency with white before JPEG encoding.
        BufferedImage out = new BufferedImage(newW, newH, BufferedImage.TYPE_INT_RGB);
        Graphics2D graphics = out.createGraphics();
        try {
            graphics.setColor(Color.WHITE);
            graphics.fillRect(0, 0, newW, newH);
            graphics.setRenderingHint(RenderingHints.KEY_INTERPOLATION, RenderingHints.VALUE_INTERPOLATION_BILINEAR);
            graphics.drawImage(source, 0, 0, newW, newH, null);
        } finally {
            graphics.dispose();
        }
        return out;
    }

    private static byte[] encodeJpeg(BufferedImage image) throws IOException {
        Iterator<ImageWriter> writers = ImageIO.getImageWritersByFormatName("jpg");
        if (!writers.hasNext()) {
            throw new IOException("No JPEG writer available");
        }
        ImageWriter writer = writers.next();
        ImageWriteParam param = writer.getDefaultWriteParam();
        param.setCompressionMode(ImageWriteParam.MODE_EXPLICIT);
        param.setCompressionQuality(JPEG_QUALITY);

        ByteArrayOutputStream bytes = new ByteArrayOutputStream();
        try (ImageOutputStream stream = ImageIO.createImageOutputStream(bytes)) {
            writer.setOutput(stream);
            writer.write(null, new IIOImage(image, null, null), param);
        } finally {
            writer.dispose();
        }
        return bytes.toByteArray();
    }
}
