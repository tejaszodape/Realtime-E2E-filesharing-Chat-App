import { useState } from "react";
import { useAuthStore } from "../store/useAuthStore";
import { Eye, EyeOff, Loader2, Lock, Mail, MessageSquare, User } from "lucide-react";
import { Link } from "react-router-dom";
import toast from "react-hot-toast";
import AuthImagePattern from "../components/AuthImagePattern";

// Utility to convert ArrayBuffer to Base64
const arrayBufferToBase64 = (buffer) =>
  btoa(String.fromCharCode(...new Uint8Array(buffer)));

// Utility to convert Base64 to ArrayBuffer
const base64ToArrayBuffer = (base64) => {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
};

// Function to derive a key from the password using PBKDF2
async function deriveKeyFromPassword(password, salt, iterations = 100000) {
  const enc = new TextEncoder();
  const keyMaterial = await window.crypto.subtle.importKey(
    "raw",
    enc.encode(password),
    "PBKDF2",
    false,
    ["deriveKey"]
  );
  return window.crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: salt,
      iterations: iterations,
      hash: "SHA-256",
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

// Function to encrypt data using AES-GCM
async function encryptData(key, data) {
  const iv = window.crypto.getRandomValues(new Uint8Array(12)); // 96-bit IV for GCM
  const encryptedBuffer = await window.crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv: iv,
    },
    key,
    data
  );
  return { encryptedBuffer, iv };
}

const SignUpPage = () => {
  const [showPassword, setShowPassword] = useState(false);
  const [formData, setFormData] = useState({
    fullName: "",
    email: "",
    password: "", // This will be used to encrypt the private key
  });

  const { signup, isSigningUp } = useAuthStore();

  const validateForm = () => {
    if (!formData.fullName.trim()) return toast.error("Full name is required");
    if (!formData.email.trim()) return toast.error("Email is required");
    if (!/\S+@\S+\.\S+/.test(formData.email)) return toast.error("Invalid email format");
    if (!formData.password) return toast.error("Password is required");
    if (formData.password.length < 6)
      return toast.error("Password must be at least 6 characters");

    return true;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const isValid = validateForm();
    if (isValid !== true) return;

    try {
      // 1️⃣ Generate ECDH Key Pair using Web Crypto API
      const keyPair = await window.crypto.subtle.generateKey(
        {
          name: "ECDH",
          namedCurve: "P-256",
        },
        true,
        ["deriveKey", "deriveBits"]
      );

      // 2️⃣ Export public + private keys
      const publicKeyBuffer = await window.crypto.subtle.exportKey("raw", keyPair.publicKey);
      const privateKeyBuffer = await window.crypto.subtle.exportKey("pkcs8", keyPair.privateKey);

      const publicKeyBase64 = arrayBufferToBase64(publicKeyBuffer);
      // const privateKeyBase64 = arrayBufferToBase64(privateKeyBuffer); // Don't store this locally unencrypted

      // 3️⃣ Derive encryption key from user's password
      const salt = window.crypto.getRandomValues(new Uint8Array(16)); // Generate a random salt
      const encryptionKey = await deriveKeyFromPassword(formData.password, salt);

      // 4️⃣ Encrypt the private key
      const { encryptedBuffer, iv } = await encryptData(encryptionKey, privateKeyBuffer);
      const encryptedPrivateKeyBase64 = arrayBufferToBase64(encryptedBuffer);
      const ivBase64 = arrayBufferToBase64(iv);
      const saltBase64 = arrayBufferToBase64(salt);

      // 5️⃣ Prepare data to send to backend
      // Send the public key in plaintext (needed by others to encrypt messages for this user)
      // Send the encrypted private key, IV, and salt (needed to decrypt the private key later)
      const signupData = {
        ...formData,
        publicKey: publicKeyBase64, // Public key in plaintext
        encryptedPrivateKey: encryptedPrivateKeyBase64, // Encrypted private key
        keySalt: saltBase64,       // Salt used for key derivation
        keyIv: ivBase64,           // IV used for encryption
        // Do NOT send the plaintext privateKey or the user's password beyond signup validation
      };

      // 6️⃣ Send signup data (including encrypted private key) to backend
      // Modify your signup function in useAuthStore to accept and send these extra fields
      await signup(signupData);

      // 7️⃣ Store something locally to indicate key is on server?
      // You might store a flag or perhaps re-derive/store the key locally later if needed,
      // but the main point is it's now also on the server (encrypted).
      // For now, let's still store the plaintext private key locally for immediate use,
      // though in a full implementation, you might derive it on login using the password.
      localStorage.setItem("privateKey", arrayBufferToBase64(privateKeyBuffer)); // Store locally for now

    } catch (error) {
      console.error("Signup failed:", error);
      toast.error("Something went wrong during signup.");
    }
  };

  



  return (
    <div className="min-h-screen grid lg:grid-cols-2">
      <div className="flex flex-col justify-center items-center p-6 sm:p-12">
        <div className="w-full max-w-md space-y-8">
          <div className="text-center mb-8">
            <div className="flex flex-col items-center gap-2 group">
              <div className="size-12 rounded-xl bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                <MessageSquare className="size-6 text-primary" />
              </div>
              <h1 className="text-2xl font-bold mt-2">Create Account</h1>
              <p className="text-base-content/60">Get started with your free account</p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="form-control">
              <label className="label">
                <span className="label-text font-medium">Full Name</span>
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <User className="size-5 text-base-content/40" />
                </div>
                <input
                  type="text"
                  className="input input-bordered w-full pl-10"
                  placeholder="John Doe"
                  value={formData.fullName}
                  onChange={(e) =>
                    setFormData({ ...formData, fullName: e.target.value })
                  }
                />
              </div>
            </div>

            <div className="form-control">
              <label className="label">
                <span className="label-text font-medium">Email</span>
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Mail className="size-5 text-base-content/40" />
                </div>
                <input
                  type="email"
                  className="input input-bordered w-full pl-10"
                  placeholder="you@example.com"
                  value={formData.email}
                  onChange={(e) =>
                    setFormData({ ...formData, email: e.target.value })
                  }
                />
              </div>
            </div>

            <div className="form-control">
              <label className="label">
                <span className="label-text font-medium">Password</span>
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Lock className="size-5 text-base-content/40" />
                </div>
                <input
                  type={showPassword ? "text" : "password"}
                  className="input input-bordered w-full pl-10"
                  placeholder="••••••••"
                  value={formData.password}
                  onChange={(e) =>
                    setFormData({ ...formData, password: e.target.value })
                  }
                />
                <button
                  type="button"
                  className="absolute inset-y-0 right-0 pr-3 flex items-center"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? (
                    <EyeOff className="size-5 text-base-content/40" />
                  ) : (
                    <Eye className="size-5 text-base-content/40" />
                  )}
                </button>
              </div>
            </div>

            <button type="submit" className="btn btn-primary w-full" disabled={isSigningUp}>
              {isSigningUp ? (
                <>
                  <Loader2 className="size-5 animate-spin" />
                  Loading...
                </>
              ) : (
                "Create Account"
              )}
            </button>
          </form>

          <div className="text-center">
            <p className="text-base-content/60">
              Already have an account?{" "}
              <Link to="/login" className="link link-primary">
                Sign in
              </Link>
            </p>
          </div>
        </div>
      </div>

      <AuthImagePattern
        title="Join our community"
        subtitle="Connect with friends, share moments, and stay in touch with your loved ones."
      />
    </div>
  );
};

export default SignUpPage;
