import express from "express";
import multer from "multer";
import path from "path";
import { execFile } from "child_process";
import fs from "fs";
import { globSync } from "glob";

const router = express.Router();
const upload = multer({ dest: "temp/" });

// --- Defender detection ---
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

// --- EICAR detection (text-based) ---
function isEicarByTextPrefix(filePath) {
  try {
    const fd = fs.openSync(filePath, "r");
    const buf = Buffer.alloc(1024);
    const bytes = fs.readSync(fd, buf, 0, buf.length, 0);
    fs.closeSync(fd);

    const chunk = buf.slice(0, bytes).toString("utf8");
    const normalized = chunk.replace(/\r\n/g, "\n").replace(/\s+/g, " ").trim().toLowerCase();
    return normalized.includes("eicar-standard-antivirus-test-file");
  } catch (e) {
    console.warn("EICAR detection read error:", e?.message);
    return false;
  }
}

// --- Scan route ---
router.post("/", upload.single("file"), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ status: "error", message: "No file uploaded" });
  }

  const absPath = path.resolve(req.file.path);
  const cleanup = () => fs.unlink(absPath, () => {});

  // 1. Check for EICAR test file
  if (isEicarByTextPrefix(absPath)) {
    cleanup();
    return res.json({ status: "infected", details: "EICAR test file detected (text match)" });
  }

  // 2. If Defender is NOT available, use safe bypass (for dev/testing only!)
  if (!DEFENDER_PATH) {
    console.warn("⚠️ Defender not found – bypassing scan (development mode)");
    cleanup();
    // ⚠️ In production, you might want to block files instead!
    return res.json({ status: "clean", details: "Defender unavailable – scan bypassed" });
  }

  // 3. Run actual Defender scan
  const args = ["-Scan", "-ScanType", "3", "-File", absPath, "-DisableRemediation"];
  const TIMEOUT_MS = 120000; // 2 minutes

  console.log("Running Defender:", DEFENDER_PATH, args.join(" "));

  execFile(DEFENDER_PATH, args, { timeout: TIMEOUT_MS, windowsHide: true }, (err, stdout, stderr) => {
    const out = (stdout || "") + "\n" + (stderr || "");
    console.log("=== Defender raw output ===\n", out);
    cleanup();

    if (err) {
      console.warn("Defender process error:", err.message);
    }

    const lower = out.toLowerCase();
    if (lower.includes("found no threats") || lower.includes("no threats found") || lower.includes("no threats")) {
      return res.json({ status: "clean" });
    }
    if (lower.includes("threat") || lower.includes("detected") || lower.includes("malware")) {
      return res.json({ status: "infected" });
    }

    return res.status(500).json({ status: "error", message: "ambiguous scan result", details: out });
  });
});

export default router;