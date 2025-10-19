// lib/windowsDefenderScan.js
import fs from "fs";
import { globSync } from "glob";
import { execFile } from "child_process";

export function findDefender() {
  const candidates = [
    "C:\\Program Files\\Windows Defender\\MpCmdRun.exe",
    "C:\\Program Files\\Windows Defender\\Platform\\*\\MpCmdRun.exe",
    "C:\\ProgramData\\Microsoft\\Windows Defender\\Platform\\*\\MpCmdRun.exe"
  ];

  for (const c of candidates) {
    const matches = globSync(c);
    if (matches && matches.length > 0) {
      matches.sort();
      return matches[matches.length - 1];
    }
    try {
      if (fs.existsSync(c)) return c;
    } catch (e) {}
  }
  return null;
}

export function scanFile(filePath) {
  return new Promise((resolve, reject) => {
    const defenderPath = findDefender();
    if (!defenderPath) return reject(new Error("Windows Defender not found"));

    const args = ["-Scan", "-ScanType", "3", "-File", filePath, "-DisableRemediation"];

    execFile(defenderPath, args, (err, stdout, stderr) => {
      if (err) return reject(err);

      const output = (stdout || "") + "\n" + (stderr || "");
      if (output.toLowerCase().includes("found no threats")) {
        resolve({ status: "clean", details: output });
      } else if (output.toLowerCase().includes("threats found")) {
        resolve({ status: "infected", details: output });
      } else {
        resolve({ status: "error", details: output });
      }
    });
  });
}
