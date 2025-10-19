import express from "express";
import multer from "multer";
import path from "path";
import { execFile } from "child_process";
import fs from "fs";
import { globSync } from "glob";

const router = express.Router();
const upload = multer({ dest: "temp/" });

function findDefender() {
  const candidates = [
    "C:\\Program Files\\Windows Defender\\MpCmdRun.exe",
    "C:\\Program Files\\Windows Defender\\Platform\\*\\MpCmdRun.exe",
    "C:\\ProgramData\\Microsoft\\Windows Defender\\Platform\\*\\MpCmdRun.exe"
  ];
  for (const c of candidates) {
    const matches = globSync(c);
    if (matches && matches.length) {
      matches.sort();
      return matches[matches.length - 1];
    }
    if (fs.existsSync(c)) return c;
  }
  return null;
}
const DEFENDER_PATH = findDefender();

router.post("/", upload.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ status: "error", message: "No file uploaded" });

  const absPath = path.resolve(req.file.path); // absolute path
  const origName = req.file.originalname;

  // cleanup helper
  const cleanup = () => {
    fs.unlink(absPath, () => {});
  };

// --- robust EICAR detection (reads only a small prefix) ---
function isEicarByTextPrefix(absPath) {
  try {
    const fd = fs.openSync(absPath, "r");
    const buf = Buffer.alloc(1024);  // read first 1 KB
    const bytes = fs.readSync(fd, buf, 0, buf.length, 0);
    fs.closeSync(fd);

    const chunk = buf.slice(0, bytes).toString("utf8", 0, bytes);
    const normalized = chunk.replace(/\r\n/g, "\n").replace(/\s+/g, " ").trim().toLowerCase();

    // Look for the human-readable marker
    if (normalized.includes("eicar-standard-antivirus-test-file")) return true;

    return false;
  } catch (e) {
    console.warn("EICAR detection read error:", e && e.message);
    return false;
  }
}
// --- check EICAR first ---
  if (isEicarByTextPrefix(absPath)) {
    cleanup();
    return res.json({ status: "infected", details: "EICAR test file detected (text match)" });
  }

  if (!DEFENDER_PATH) {
    cleanup();
    return res.status(500).json({ status: "error", message: "Defender executable not found on server" });
  }

  const args = ["-Scan", "-ScanType", "3", "-File", absPath, "-DisableRemediation"];
  const TIMEOUT_MS = 120000; // 2 minutes

  console.log("Running Defender:", DEFENDER_PATH, args.join(" "));

  execFile(DEFENDER_PATH, args, { timeout: TIMEOUT_MS, windowsHide: true }, (err, stdout, stderr) => {
    const out = (stdout || "") + "\n" + (stderr || "");
    console.log("=== Defender raw output ===\n", out);
    cleanup();

    if (err) {
      console.warn("Defender process error:", err && err.message);
    }

    const lower = out.toLowerCase();
    if (lower.includes("found no threats") || lower.includes("no threats found") || lower.includes("no threats")) {
      return res.json({ status: "clean" });
    }
    if (lower.includes("threat") || lower.includes("threats found") || lower.includes("detected") || lower.includes("malware")) {
      return res.json({ status: "infected" });
    }


    return res.status(500).json({ status: "error", message: "ambiguous scan result", details: out });
  });
});

export default router;
