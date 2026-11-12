import expo.modules.fashionvision.QualityMetrics;
import java.util.Arrays;
import java.util.Random;

public final class QualityMetricsTest {
  private static int checks = 0;
  private static void close(double actual, double expected) {
    checks++;
    if (!Double.isFinite(actual) || Math.abs(actual - expected) > 1e-8) {
      throw new AssertionError("Expected " + expected + ", got " + actual);
    }
  }
  private static void rejects(int[] pixels, int w, int h) {
    checks++;
    try { QualityMetrics.analyze(pixels, w, h); }
    catch (IllegalArgumentException expected) { return; }
    throw new AssertionError("Expected invalid dimensions to be rejected");
  }
  public static void main(String[] args) {
    int[] uniform = new int[25];
    for (int value : new int[]{0, 50, 128, 220, 255}) {
      Arrays.fill(uniform, 0xff000000 | value * 0x010101);
      double[] result = QualityMetrics.analyze(uniform, 5, 5);
      close(result[0], value);
      close(result[1], 0);
    }
    Arrays.fill(uniform, 0xffff0000);
    close(QualityMetrics.analyze(uniform, 5, 5)[0], (float) (255 * .299));
    Arrays.fill(uniform, 0xff00ff00);
    close(QualityMetrics.analyze(uniform, 5, 5)[0], (float) (255 * .587));
    Arrays.fill(uniform, 0xff0000ff);
    close(QualityMetrics.analyze(uniform, 5, 5)[0], (float) (255 * .114));
    int[] edge = new int[25];
    for (int y = 0; y < 5; y++) for (int x = 0; x < 5; x++) edge[y*5+x] = x < 2 ? 0xff000000 : 0xffffffff;
    close(QualityMetrics.analyze(edge, 5, 5)[0], 153);
    close(QualityMetrics.analyze(edge, 5, 5)[1], 43350);
    // One interior point: population variance, not its squared magnitude.
    int[] impulse = new int[9]; impulse[4] = 0xffffffff;
    close(QualityMetrics.analyze(impulse, 3, 3)[1], 0);
    // Independent double arithmetic after Float32 grayscale, like the web code.
    Random random = new Random(42);
    for (int side : new int[]{3, 13, 320, 512}) {
      int[] pixels = new int[side * side];
      double[] gray = new double[pixels.length];
      double brightness = 0;
      for (int i = 0; i < pixels.length; i++) {
        pixels[i] = random.nextInt();
        gray[i] = (float)(.299*((pixels[i]>>>16)&255) + .587*((pixels[i]>>>8)&255) + .114*(pixels[i]&255));
        brightness += gray[i];
      }
      double sum = 0, squares = 0; int n = 0;
      for (int y = 1; y < side-1; y++) for (int x = 1; x < side-1; x++) {
        int i = y*side+x;
        double l = 4*gray[i]-gray[i-1]-gray[i+1]-gray[i-side]-gray[i+side];
        sum += l; squares += l*l; n++;
      }
      double[] actual = QualityMetrics.analyze(pixels, side, side);
      close(actual[0], brightness / pixels.length);
      close(actual[1], squares/n - (sum/n)*(sum/n));
      if (actual[0] < 0 || actual[0] > 255 || actual[1] < 0 || actual[1] > 1040400) throw new AssertionError("Numeric bounds");
    }
    rejects(new int[0], 0, 0);
    rejects(new int[9], 2, 2);
    rejects(new int[9], Integer.MAX_VALUE, Integer.MAX_VALUE);
    rejects(new int[9], 3, 4);
    System.out.println("QualityMetrics: " + checks + " assertions passed (synthetic pixels only).");
  }
}
