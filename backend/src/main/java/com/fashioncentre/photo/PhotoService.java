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
import javax.imageio.ImageIO;
import javax.imageio.ImageWriteParam;
import javax.imageio.ImageWriter;
import javax.imageio.stream.ImageOutputStream;

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

@Service
@RequiredArgsConstructor
public class PhotoService {

    private static final long MAX_BYTES = 10L * 1024 * 1024;
    private static final int MIN_HEIGHT = 1000;      // smallest accepted height, in pixels
    private static final int TARGET_HEIGHT = 2000;   // photos taller than this are scaled down
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
        if (file.getSize() > MAX_BYTES) {
            throw new ResponseStatusException(HttpStatus.PAYLOAD_TOO_LARGE, "The photo must be 10 MB or smaller.");
        }

        byte[] original = file.getBytes();
        if (!isJpegOrPng(original)) {
            throw new ResponseStatusException(HttpStatus.UNSUPPORTED_MEDIA_TYPE,
                    "Please upload a JPEG or PNG photo. Other formats are converted in the browser.");        }

        // Every stored photo becomes a JPEG of a consistent size
        byte[] jpeg = normalize(original);

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

    // Checks the file's first bytes: JPEG starts with FF D8 FF, PNG starts with 89 'P' 'N' 'G'
    private static boolean isJpegOrPng(byte[] b) {
        boolean jpeg = b.length >= 3 && (b[0] & 0xFF) == 0xFF && (b[1] & 0xFF) == 0xD8 && (b[2] & 0xFF) == 0xFF;
        boolean png = b.length >= 4 && (b[0] & 0xFF) == 0x89 && b[1] == 'P' && b[2] == 'N' && b[3] == 'G';
        return jpeg || png;
    }

    // Decodes the photo, checks its shape, scales it to TARGET_HEIGHT at most, and encodes it as JPEG
    private static byte[] normalize(byte[] original) throws IOException {
        BufferedImage source = ImageIO.read(new ByteArrayInputStream(original));
        if (source == null) {
            throw new ResponseStatusException(HttpStatus.UNSUPPORTED_MEDIA_TYPE, "Use a JPEG or PNG photo.");
        }

        int w = source.getWidth();
        int h = source.getHeight();
        if (h < MIN_HEIGHT || h <= w) {
            throw new ResponseStatusException(HttpStatus.UNPROCESSABLE_ENTITY,
                    "Use a tall photo held upright, at least " + MIN_HEIGHT + " px high.");
        }

        int newH = Math.min(h, TARGET_HEIGHT);
        int newW = Math.round(w * (newH / (float) h));

        // Draw onto a plain white RGB image. This removes PNG transparency, which JPEG cannot store.
        BufferedImage out = new BufferedImage(newW, newH, BufferedImage.TYPE_INT_RGB);
        Graphics2D g = out.createGraphics();
        g.setColor(Color.WHITE);
        g.fillRect(0, 0, newW, newH);
        g.setRenderingHint(RenderingHints.KEY_INTERPOLATION, RenderingHints.VALUE_INTERPOLATION_BILINEAR);
        g.drawImage(source, 0, 0, newW, newH, null);
        g.dispose();

        return encodeJpeg(out);
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