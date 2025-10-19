# 🔐 SecureChat – E2E Encrypted Real-Time File Sharing with Malware Scanning

A secure, privacy-focused chat application built with **Node.js** and **React**, featuring **end-to-end encryption (E2E)** and real-time **malware scanning** for all file transfers.
---
LINK:- https://realtime-e2e-filesharing-chat-app.onrender.com

#(Note: I have created i bypass for Malware Scanning as the render server don't allow Defender.If Run locally remove the code in backend/routes/scan.route.js/ line no 64 -69 

#if (!DEFENDER_PATH) {
    console.warn("⚠️ Defender not found – bypassing scan (development mode)");
    cleanup();
    // ⚠️ In production, you might want to block files instead!
    return res.json({ status: "clean", details: "Defender unavailable – scan bypassed" });
  }


## ✨ Features

- 🔐 **End-to-end encryption** using **AES-256-GCM**  
- 🔑 Secure key exchange via **Elliptic Curve Diffie-Hellman (ECDH)**  
- 🛡️ **Real-time malware scanning** of all uploaded files using **Defender** (supports Microsoft Defender API or custom scanner)  
- 💬 Real-time 1:1 and group messaging with **Socket.IO**  
- 📁 Encrypted file sharing with threat detection  
- 👤 JWT-based authentication with password hashing (bcrypt)  
- 🔄 Session fingerprint verification to prevent MITM attacks  
- 📱 Fully responsive React UI  

---

## 🛠️ Tech Stack

- **Frontend**: React (TypeScript), Socket.IO Client, Web Crypto API, Material UI  
- **Backend**: Node.js, Express, Socket.IO  
- **Security**: AES-256, ECDH (secp256r1 curve), bcrypt, JWT  
- **Malware Scanning**: Defender-compatible API (configurable)  
- **Database**: MongoDb – stores only public keys & private key(encrypted using user password) and meta date    
---

## 🚀 Local Setup

### Prerequisites
- Node.js v18+
- MongoDb
- Defender API key (or use mock mode for development)

### Installation

```bash
# Clone the repo
git clone https://github.com/your-username/securechat.git
cd securechat

# Install backend dependencies
npm install

# Install frontend dependencies
cd client && npm install && cd ..

# Configure environment
cp .env.example .env
cp client/.env.example client/.env
# → Edit both .env files with your settings

# Run the app
npm start
