// Builds the app icons from build/icon.svg and build/icon-win.svg (ARCHITECTURE.md, "Packaging").
// Runs inside Electron, which renders SVG: `pnpm icons`. Writes build/icon.icns (macOS, needs iconutil),
// build/icon.ico (Windows) and build/icon.png (Linux, 1024 px). Commit the results.
const { app, BrowserWindow } = require("electron");
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

const BUILD = path.join(__dirname, "..", "build");

let page = null;

/** Draws the SVG on a canvas of `size` px in one hidden window and returns PNG bytes. */
async function render(svgFile, size) {
  if (!page) {
    page = new BrowserWindow({ width: 64, height: 64, show: false, webPreferences: { offscreen: true } });
    await page.loadURL("data:text/html,<body></body>");
  }
  const svg = fs.readFileSync(path.join(BUILD, svgFile)).toString("base64");
  const dataUrl = await page.webContents.executeJavaScript(`new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement("canvas");
      c.width = c.height = ${size};
      const g = c.getContext("2d");
      g.imageSmoothingQuality = "high";
      g.drawImage(img, 0, 0, ${size}, ${size});
      resolve(c.toDataURL("image/png"));
    };
    img.onerror = reject;
    img.src = "data:image/svg+xml;base64,${svg}";
  })`);
  return Buffer.from(dataUrl.split(",")[1], "base64");
}

/** ICO with PNG-compressed entries (supported since Windows Vista). */
function ico(pngs) {
  const header = Buffer.alloc(6 + 16 * pngs.length);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(pngs.length, 4);
  let offset = header.length;
  pngs.forEach(({ size, data }, i) => {
    const e = 6 + 16 * i;
    header.writeUInt8(size >= 256 ? 0 : size, e);
    header.writeUInt8(size >= 256 ? 0 : size, e + 1);
    header.writeUInt16LE(1, e + 4);
    header.writeUInt16LE(32, e + 6);
    header.writeUInt32LE(data.length, e + 8);
    header.writeUInt32LE(offset, e + 12);
    offset += data.length;
  });
  return Buffer.concat([header, ...pngs.map((p) => p.data)]);
}

app.disableHardwareAcceleration();
app.dock?.hide();
app.whenReady().then(async () => {
  try {
    fs.writeFileSync(path.join(BUILD, "icon.png"), await render("icon.svg", 1024));

    const win = [];
    for (const size of [16, 24, 32, 48, 64, 128, 256]) win.push({ size, data: await render("icon-win.svg", size) });
    fs.writeFileSync(path.join(BUILD, "icon.ico"), ico(win));

    if (process.platform === "darwin") {
      const set = fs.mkdtempSync(path.join(os.tmpdir(), "vnami-")) + "/icon.iconset";
      fs.mkdirSync(set);
      for (const size of [16, 32, 128, 256, 512]) {
        fs.writeFileSync(path.join(set, `icon_${size}x${size}.png`), await render("icon.svg", size));
        fs.writeFileSync(path.join(set, `icon_${size}x${size}@2x.png`), await render("icon.svg", size * 2));
      }
      execFileSync("iconutil", ["-c", "icns", set, "-o", path.join(BUILD, "icon.icns")]);
    } else {
      console.warn("icon.icns is built only on macOS (iconutil)");
    }
    console.log("Icons written to", BUILD);
  } catch (e) {
    console.error(e);
    process.exitCode = 1;
  }
  page?.destroy();
  app.quit();
});
