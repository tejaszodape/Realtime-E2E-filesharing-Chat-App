
import express from "express";
import dotenv from "dotenv";
import cookieParser from "cookie-parser";
import cors from "cors";
import path from "path";


import { connectDB } from "./lib/db.js";
import scanRoutes from "./routes/scan.route.js";

import authRoutes from "./routes/auth.route.js";
import messageRoutes from "./routes/message.route.js";
import { app, server } from "./lib/socket.js"; // Make sure this imports the correct 'app'
import fileRoutes from "./routes/file.route.js";

dotenv.config();

// --- Explicitly define PORT ---
const PORT = process.env.PORT;
const __dirname = path.resolve();

// --- Increase payload limits BEFORE your routes ---

// --- CORS: Allow ALL origins (critical for Tor Browser) ---
app.use(
  cors({
    origin: true, // ✅ Mirrors the request's Origin header — perfect for Tor
    credentials: true,
  })
);

// 2️⃣ PROXY FIRST

// 3️⃣ Only now add body parsers, cookies, other routes, static handlers
app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ limit: '100mb', extended: true }));
app.use(cookieParser());
app.use("/api/scan-file", scanRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/messages", messageRoutes);
app.use("/api/files", fileRoutes);// Make sure this is included

// --- Serve static files for production ---
if (process.env.NODE_ENV === "production") {
  app.use(express.static(path.join(__dirname, "../frontend/dist")));

  app.get("*", (req, res) => {
    res.sendFile(path.join(__dirname, "../frontend", "dist", "index.html"));
  });
}

// --- Start the server ---
server.listen(PORT, () => {
  console.log(`🚀 Server is running on PORT: ${PORT}`);
  connectDB(); // Connect to MongoDB
});


