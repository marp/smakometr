const { chromium } = require("@playwright/test");
const fs = require("fs");
const path = require("path");

(async () => {
  const svgContent = fs.readFileSync(
    path.join(__dirname, "src/icons/icon.svg"),
    "utf8"
  );
  const svgBase64 = Buffer.from(svgContent).toString("base64");

  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.setViewportSize({ width: 128, height: 128 });
  await page.setContent(`<!DOCTYPE html>
<html><head><style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { width: 128px; height: 128px; background: transparent; overflow: hidden; }
  img { position: absolute; top: 16px; left: 16px; width: 96px; height: 96px; }
</style></head>
<body><img src="data:image/svg+xml;base64,${svgBase64}"></body>
</html>`);

  await page.screenshot({
    path: path.join(__dirname, "src/icons/icon-128.png"),
    omitBackground: true,
  });

  await browser.close();
  console.log("Zapisano: src/icons/icon-128.png (128x128, ikona 96x96 + 16px padding)");
})();
