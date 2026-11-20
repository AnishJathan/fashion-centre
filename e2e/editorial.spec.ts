import { expect, test } from '@playwright/test';

test('lookbook selection, rounded controls and reduced motion at phone width', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await page.emulateMedia({ reducedMotion: 'reduce', colorScheme: 'dark' });
  await page.goto('/');
  const cover = page.getByRole('region', { name: 'Style lookbook' });
  for (const [label, title, image] of [
    ['Off duty', 'Off duty.', /sneakers/], ['Accessories', 'Finishing touches.', /handbag/], ['Field notes', 'The field edit.', /trench/],
  ] as const) {
    const choice = cover.getByRole('button', { name: label, exact: true });
    await choice.click();
    await expect(choice).toHaveAttribute('aria-pressed', 'true');
    await expect(cover.getByRole('heading', { name: title })).toBeVisible();
    await expect(cover.getByRole('img', { name: image })).toHaveCSS('animation-name', 'none');
    expect(await cover.locator('img').evaluate(node => (node as HTMLImageElement).decode().then(() => node.naturalWidth))).toBeGreaterThan(200);
  }
  await expect(cover).toHaveCSS('border-radius', '24px');
  await cover.getByRole('link', { name: 'Choose a demo store' }).click();
  await expect(page).toHaveURL(/#\/merchant$/);
});
