import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

// Exercise the production bundle, including routing, with deterministic auth.
// No live account, database, ArcGIS service, or map credentials are required.
const output = fileURLToPath(
  new URL("../.landing-test-artifacts/", import.meta.url),
);
await mkdir(output, { recursive: true });
const root = new URL("../dist/public/", import.meta.url);
const types = {
  ".js": "text/javascript",
  ".css": "text/css",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".html": "text/html",
};
const server = createServer(async (request, response) => {
  const pathname = new URL(request.url, "http://localhost").pathname;
  let file = new URL(`.${pathname}`, root);
  if (!file.href.startsWith(root.href)) {
    response.writeHead(403).end();
    return;
  }
  let body;
  try {
    body = await readFile(file);
  } catch {
    file = new URL("index.html", root);
    body = await readFile(file);
  }
  response.setHeader(
    "Content-Type",
    types[file.pathname.match(/\.[^.]+$/)?.[0]] || "application/octet-stream",
  );
  response.end(body);
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const base = `http://127.0.0.1:${server.address().port}`;
let browser;
try {
  browser = await chromium.launch({
    headless: true,
    ...(process.env.ATLAS_CHROMIUM_EXECUTABLE
      ? { executablePath: process.env.ATLAS_CHROMIUM_EXECUTABLE }
      : {}),
    args: [
      "--no-sandbox",
      "--enable-unsafe-swiftshader",
      "--use-gl=angle",
      "--use-angle=swiftshader",
      "--disable-dev-shm-usage",
    ],
  });
  const user = {
    id: 1,
    email: "landing-test@example.com",
    name: "Landing Test",
    role: "client",
  };
  for (const scenario of [
    { name: "desktop", width: 1440, height: 900, authenticated: true },
    { name: "mobile", width: 390, height: 844, authenticated: true },
    { name: "sign-in", width: 1440, height: 900, authenticated: false },
    {
      name: "reduced-motion",
      width: 1440,
      height: 900,
      authenticated: true,
      reduced: true,
    },
    {
      name: "stalled-frames",
      width: 1440,
      height: 900,
      authenticated: true,
      stalled: true,
    },
    {
      name: "no-webgl",
      width: 1440,
      height: 900,
      authenticated: true,
      noWebGL: true,
    },
  ]) {
    let authenticated = scenario.authenticated;
    const page = await browser.newPage({
      viewport: { width: scenario.width, height: scenario.height },
      reducedMotion: scenario.reduced ? "reduce" : "no-preference",
    });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.route("**/api/**", (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path === "/api/auth/login") authenticated = true;
      const auth = path === "/api/auth/me" || path === "/api/auth/login";
      return route.fulfill({
        status: auth && !authenticated ? 401 : 200,
        contentType: "application/json",
        body: JSON.stringify(
          auth ? (authenticated ? user : { message: "Unauthorized" }) : [],
        ),
      });
    });
    // The existing map shell is tested; remote tile loading is outside this change.
    await page.route("https://**/*", (route) => route.abort());
    if (scenario.noWebGL)
      await page.addInitScript(() => {
        const original = HTMLCanvasElement.prototype.getContext;
        HTMLCanvasElement.prototype.getContext = function (type, ...args) {
          return String(type).includes("webgl")
            ? null
            : original.call(this, type, ...args);
        };
      });
    await page.goto(base);
    await page
      .getByRole("heading", { name: "International Service Map", exact: true })
      .waitFor();
    const systemFonts = await page.evaluate(() => ({
      body: getComputedStyle(document.body).fontFamily,
      landing: getComputedStyle(document.querySelector(".atlas-landing")).fontFamily,
      button: getComputedStyle(document.querySelector(".atlas-landing-enter")).fontFamily,
      remoteFonts: document.querySelectorAll('link[href*="fonts.googleapis.com"]').length,
    }));
    for (const family of [systemFonts.body, systemFonts.landing, systemFonts.button]) {
      assert.match(family, /-apple-system/, "Apple system font is preferred");
      assert.doesNotMatch(family, /Inter/, "No Inter override");
    }
    assert.equal(systemFonts.remoteFonts, 0, "No external font download");
    assert.equal(
      await page
        .getByRole("button", { name: "Search map", exact: true })
        .count(),
      0,
    );
    assert.equal(
      await page.getByTestId("atlas-entry-rings").count(),
      0,
      "No rings before entry",
    );
    const geometry = await page.evaluate(() => {
      const rect = (selector) =>
        document.querySelector(selector).getBoundingClientRect();
      const logo = rect(".atlas-landing-logo"),
        stage = rect(".atlas-globe-stage"),
        button = rect(".atlas-landing-enter");
      return {
        logoOffset: Math.abs((logo.left + logo.right) / 2 - innerWidth / 2),
        gap: stage.top + stage.width * 0.1 - button.bottom,
        logoWidth: logo.width,
        overflow: document.documentElement.scrollWidth > innerWidth,
      };
    });
    assert.ok(geometry.logoOffset <= 1, "Logo centered on viewport");
    assert.ok(
      geometry.logoWidth >= 200 && geometry.logoWidth <= 280,
      "Logo has a compact, readable size",
    );
    assert.ok(
      geometry.gap >= 0 && geometry.gap <= 25,
      "Globe edge stays close to button",
    );
    assert.equal(geometry.overflow, false, "No horizontal scrolling");
    if (["desktop", "mobile"].includes(scenario.name)) {
      await page.waitForTimeout(500);
      await page.screenshot({
        path: `${output}/${scenario.name}.png`,
        fullPage: true,
      });
    }
    if (scenario.stalled)
      await page.evaluate(() => {
        window.requestAnimationFrame = () => 0;
      });
    await page.getByRole("button", { name: "Enter Map" }).click();
    if (!scenario.reduced && !scenario.noWebGL) {
      await page.getByTestId("atlas-entry-rings").locator("canvas").waitFor();
      assert.equal(
        await page.getByRole("button", { name: "Enter Map" }).isDisabled(),
        true,
      );
      assert.equal(
        await page.getByTestId("atlas-entry-rings").count(),
        1,
        "Only one effect mounted",
      );
      const offset = await page.evaluate(() => {
        const globe = document
          .querySelector(".atlas-globe-stage")
          .getBoundingClientRect();
        const rings = document
          .querySelector(".atlas-landing-rings")
          .getBoundingClientRect();
        return Math.hypot(
          (globe.left + globe.right - rings.left - rings.right) / 2,
          (globe.top + globe.bottom - rings.top - rings.bottom) / 2,
        );
      });
      assert.ok(offset <= 1, "Rings originate at globe center");
      if (scenario.name === "desktop") {
        await page.waitForTimeout(600);
        await page.screenshot({
          path: `${output}/silver-white-rings.png`,
          fullPage: true,
        });
      }
    }
    if (!scenario.authenticated) {
      await page
        .getByRole("heading", { name: "Global Coverage Atlas", exact: true })
        .waitFor({ timeout: 12000 });
      assert.equal(new URL(page.url()).pathname, "/login");
      await page.getByLabel("Email", { exact: true }).fill(user.email);
      await page
        .getByLabel("Password", { exact: true })
        .fill("test-password-only");
      await page
        .getByRole("button", { name: "Open Coverage Atlas", exact: true })
        .click();
    }
    await page
      .getByRole("button", { name: "Search map", exact: true })
      .waitFor({ timeout: 15000 });
    assert.equal(
      await page.locator(".atlas-landing").count(),
      0,
      "Landing unmounted after entry",
    );
    assert.equal(
      await page.getByTestId("atlas-entry-rings").count(),
      0,
      "Effect removed after one play",
    );
    assert.deepEqual(errors, [], "No uncaught browser errors");
    if (["desktop", "mobile"].includes(scenario.name)) {
      const rail = page.getByRole("region", { name: "Mission service filters" });
      const first = rail.getByRole("button").first();
      const last = rail.getByRole("button").last();
      const visibleInside = async (button) => {
        const outer = await rail.boundingBox(), inner = await button.boundingBox();
        return inner.x >= outer.x - 1 && inner.x + inner.width <= outer.x + outer.width + 1;
      };
      assert.equal(await visibleInside(first), true, "First service is reachable at start");
      await rail.hover();
      await page.mouse.wheel(0, 3000);
      await page.waitForTimeout(200);
      assert.equal(await visibleInside(last), true, "Mouse wheel reaches final service");
      await rail.evaluate((element) => { element.scrollLeft = 0; });
      assert.equal(await visibleInside(first), true, "Can return to first service");
      assert.equal(await page.locator(".atlas-map-mode-toggle").count(), 0, "No separate floating view toolbar");
      await page.getByRole("button", { name: "Open Atlas tools" }).click();
      const tools = page.getByRole("dialog", { name: "Atlas map tools" });
      await tools.getByRole("button", { name: "2D", exact: true }).click();
      const map = page.getByRole("application", { name: "Occu-Med coverage map", exact: true });
      await map.waitFor();
      const box = await map.boundingBox();
      assert.equal(box.width, scenario.width, "2D map host fills viewport width");
      assert.equal(box.height, scenario.height, "2D map host fills viewport height");
      assert.equal(await map.evaluate((element) => getComputedStyle(element).backgroundColor), "rgb(21, 26, 35)", "Dark map fallback background");
      await page.getByRole("button", { name: "Collapse Atlas tools" }).click();
      await page.screenshot({ path: `${output}/${scenario.name}-map-layout.png`, fullPage: true });
    }
    if (scenario.name === "sign-in") {
      await page.goto(`${base}/login`);
      await page
        .getByRole("heading", { name: "Global Coverage Atlas", exact: true })
        .waitFor();
      assert.equal(
        await page.locator(".atlas-landing").count(),
        0,
        "Direct login route preserved",
      );
    }
    await page.close();
    console.log(`PASS ${scenario.name}`);
  }
} finally {
  await browser?.close();
  await new Promise((resolve) => server.close(resolve));
}
