package expo.modules.fashionvision;

/** Pure numerical equivalent of src/photoChecks.ts, independent of Android. */
public final class QualityMetrics {
  private QualityMetrics() {}

  public static double[] analyze(int[] argb, int width, int height) {
    if (width < 3 || height < 3 || (long) width * height != argb.length) {
      throw new IllegalArgumentException("A matching image of at least 3 by 3 pixels is required");
    }
    // Match the web Float32Array before calculating JS-number (double) sums.
    float[] gray = new float[argb.length];
    double brightness = 0;
    for (int i = 0; i < argb.length; i++) {
      int p = argb[i];
      gray[i] = (float) (0.299 * ((p >>> 16) & 255)
          + 0.587 * ((p >>> 8) & 255) + 0.114 * (p & 255));
      brightness += gray[i];
    }
    double sum = 0, sumSq = 0;
    int count = 0;
    for (int y = 1; y < height - 1; y++) {
      for (int x = 1; x < width - 1; x++) {
        int i = y * width + x;
        double laplacian = 4.0 * gray[i] - gray[i - 1] - gray[i + 1]
            - gray[i - width] - gray[i + width];
        sum += laplacian;
        sumSq += laplacian * laplacian;
        count++;
      }
    }
    double mean = sum / count;
    return new double[] {brightness / gray.length, sumSq / count - mean * mean};
  }
}
