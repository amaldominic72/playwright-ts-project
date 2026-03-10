import { chromium, firefox, webkit, BrowserType, Browser, BrowserContext, Page } from 'playwright';

interface BrowserConfig {
  type: BrowserType;
  name: string;
  channel?: string;
}

async function runInBrowser(config: BrowserConfig, url: string): Promise<void> {
  console.log(`Launching ${config.name}...`);

  const launchOptions: Parameters<BrowserType['launch']>[0] = {
    headless: false,
    ...(config.channel ? { channel: config.channel } : {}),
    // '--start-maximized' only works in Chromium-based browsers
    ...(config.type === chromium
      ? { args: ['--start-maximized'] }
      : {}),
  };

  let browser: Browser | null = null;

  try {
    browser = await config.type.launch(launchOptions);

    const contextOptions: Parameters<Browser['newContext']>[0] = {
      // null viewport = use the OS window size (only works in Chromium with --start-maximized)
      // For Firefox/WebKit we set an explicit large viewport instead
      viewport: config.type === chromium ? null : { width: 1920, height: 1080 },
    };

    const context: BrowserContext = await browser.newContext(contextOptions);
    const page: Page = await context.newPage();

    // Firefox & WebKit don't honour --start-maximized, so we resize the window manually
    if (config.type !== chromium) {
      await page.setViewportSize({ width: 1920, height: 1080 });
    }

    // ── Load Swagger ──────────────────────────────────────────────────────────
    await page.goto(url, { waitUntil: 'networkidle' });
    await page.waitForSelector('#swagger-ui', { timeout: 30_000 });

    // ── Cookie banner (optional) ──────────────────────────────────────────────
    const cookieButton = page.getByRole('button', { name: 'Allow all cookies' });
    if (await cookieButton.count()) {
      await cookieButton.click();
    }

    await page.waitForSelector('.highlight-code');

    // ── Merchant signup – expand the operation block ──────────────────────────
    const merchantSignupButton = page.locator('button.opblock-summary-control', {
      hasText: 'Check email availability for merchant registration',
    });

    // Click only if the section is currently collapsed
    const isExpanded = await merchantSignupButton.getAttribute('aria-expanded');
    if (isExpanded !== 'true') {
      await merchantSignupButton.click();
    }

    await merchantSignupButton.waitFor({ state: 'visible' });

    // Fill body and execute
    await page.locator('textarea.body-param__text').first().fill('{"email": "amal@example.com"}');
    await page.getByRole('button', { name: 'Execute' }).first().click();

    await page.waitForSelector('.highlight-code');

    // ── Scroll to Response body ───────────────────────────────────────────────
    const responseBodySection = page.locator('h5', { hasText: 'Response body' });
    await responseBodySection.waitFor();
    await responseBodySection.scrollIntoViewIfNeeded();

    // Copy response to clipboard
    const copyBtn = page.locator('.highlight-code .copy-to-clipboard button');
    await copyBtn.click();

    // Collapse the merchant signup block again
    await merchantSignupButton.click();

    await page.waitForSelector('.highlight-code');

    // ── Verify email token – expand the operation block ───────────────────────
    const verifyButton = page.locator('button.opblock-summary-control', {
      hasText: 'Verify email verification token and extract email',
    });

    const isVerifyExpanded = await verifyButton.getAttribute('aria-expanded');
    if (isVerifyExpanded !== 'true') {
      await verifyButton.click();
    }

    // Read clipboard and fill token
    const token: string = await page.evaluate(() => navigator.clipboard.readText());
    await page.locator('textarea.body-param__text').first().fill(token);

    // Wait before closing so results are visible
    await page.waitForTimeout(3_000);

    console.log(`${config.name} finished successfully.`);
  } catch (err) {
    console.error(`${config.name} encountered an error:`, err);
  } finally {
    await browser?.close();
  }
}

(async () => {
  const url = 'http://192.168.1.160:8080/docs/swagger';

  const browsers: BrowserConfig[] = [
    { type: chromium, name: 'Chrome' },
    { type: firefox,  name: 'Firefox' },
    { type: webkit,   name: 'WebKit / Safari' },
    { type: chromium, name: 'Edge', channel: 'msedge' },
  ];

  // Run browsers sequentially so logs stay readable.
  // Replace with Promise.all(browsers.map(...)) if you want them in parallel.
  for (const config of browsers) {
    await runInBrowser(config, url);
  }
})();