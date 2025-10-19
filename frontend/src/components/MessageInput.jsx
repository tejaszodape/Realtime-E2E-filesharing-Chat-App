import { useState, useRef } from "react";
import { useChatStore } from "../store/useChatStore";
import { useAuthStore } from "../store/useAuthStore";
import { BsSend } from "react-icons/bs";
import { FaPaperclip, FaTimes } from "react-icons/fa";
import axios from "axios"; // Make sure axios is imported for the scan API call
import toast from "react-hot-toast";

// Helper functions
const base64ToArrayBuffer = (base64) => Uint8Array.from(atob(base64), c => c.charCodeAt(0));
// const arrayBufferToBase64 = (buffer) => btoa(String.fromCharCode(...new Uint8Array(buffer)));
const arrayBufferToBase64 = (buffer) => {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000; // 32KB chunks to avoid call stack limits

  try {
    // Process the buffer in chunks
    for (let i = 0; i < bytes.length; i += chunkSize) {
      const chunkEnd = Math.min(i + chunkSize, bytes.length);
      // Extract a sub-array for this chunk
      const chunk = bytes.subarray(i, chunkEnd);
      // Convert chunk to binary string using fromCharCode.apply or a loop
      // Using apply can still hit limits, so a simple loop is safest for huge chunks
      // Or, use apply cautiously for smaller chunks:
      // binary += String.fromCharCode.apply(null, chunk);

      // Safest loop-based approach for each chunk:
      let chunkBinary = '';
      for (let j = 0; j < chunk.length; j++) {
        chunkBinary += String.fromCharCode(chunk[j]);
      }
      binary += chunkBinary;
    }
    // Finally, encode the complete binary string to Base64
    return btoa(binary);
  } catch (error) {
    console.error("❌ Error in robust arrayBufferToBase64 conversion:", error);
    throw new Error("Failed to convert file data. The file might be too large.");
  }
};

const MessageInput = () => {
  const [text, setText] = useState("");
  const [file, setFile] = useState(null);
  const [filePreview, setFilePreview] = useState(null);
  const [isEncrypting, setIsEncrypting] = useState(false);

  const fileInputRef = useRef(null);

  const { sendMessage, selectedUser } = useChatStore();
  const { authUser } = useAuthStore();

  const handleFileChange = (e) => {
    const selected = e.target.files[0];
    if (selected) {
      setFile(selected);
      setFilePreview(URL.createObjectURL(selected));
    }
  };

  const clearFile = () => {
    setFile(null);
    setFilePreview(null);
    if (fileInputRef.current) fileInputRef.current.value = null;
  };

  // --- NEW FUNCTION: Malware Scan ---
  // Inside MessageInput.jsx

const scanFileForMalware = async (fileToScan) => {
  const scanFormData = new FormData();
  scanFormData.append('file', fileToScan);

  try {
    console.log("🔍 Sending file to  malware scanner:", fileToScan.name);
    // Make sure this URL matches where your Python API is running
    const scanResponse = await axios.post('/api/scan-file', scanFormData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
      timeout: 1000000000, // Increase timeout for potentially large scans (e.g., 60 seconds)
    });

    console.log("✅ Malware scan response received:", scanResponse.data);
    // Expect { status: 'clean' } or { status: 'infected', details: '...' } or { status: 'error', ... }
    if (scanResponse.data.status === 'clean') {
      return { isClean: true };
    } else if (scanResponse.data.status === 'infected') {
      return { isClean: false, details: scanResponse.data.details || 'File flagged as potentially unsafe by malware scanner.' };
    } else {
      // Handle unexpected status from Python API

      // Log the full response for debugging
      console.error("⚠️ Unexpected status from Python API:", scanResponse.data);
      throw new Error(scanResponse.data.message || scanResponse.data.error || 'Malware scan service returned an unexpected response format.');
    }
  } catch (scanError) {
    // --- IMPROVED ERROR LOGGING ---
    console.error("❌ Detailed Error during malware scan (Python API):", scanError);

    // Differentiate between network errors and scan results/errors from the API
    if (scanError.response) {
      // --- SERVER RESPONDED WITH ERROR ---
      console.error("❌ Python API responded with error status:", scanError.response.status);
      console.error("❌ Python API error response headers:", scanError.response.headers);
      console.error("❌ Python API error response data:", scanError.response.data);

      // Try to get a user-friendly message from the API response
      let serverMessage = 'Scan service error.';
      if (scanError.response.data) {
        if (typeof scanError.response.data === 'string') {
          serverMessage = scanError.response.data;
        } else if (scanError.response.data.message) {
          serverMessage = scanError.response.data.message;
        } else if (scanError.response.data.error) {
          serverMessage = scanError.response.data.error;
        } else {
          // If it's an object but no standard message, stringify part of it
          serverMessage = JSON.stringify(scanError.response.data).substring(0, 200); // Limit length
        }
      }
      return { isClean: false, details: `Malware scan failed (API Error ${scanError.response.status}): ${serverMessage}` };
    } else if (scanError.request) {
      // --- NO RESPONSE RECEIVED (NETWORK ISSUE, TIMEOUT, API DOWN) ---
      console.error("❌ No response received from Python API:", scanError.request);
      // Check if it was a timeout
      if (scanError.code === 'ECONNABORTED') {
         return { isClean: false, details: 'Malware scan timed out. The file might be too large or the service is busy. Please try again later.' };
      } else {
         return { isClean: false, details: 'Unable to reach malware scan service. Please check your connection, ensure the Python API is running, and try again later.' };
      }
    } else {
      // --- ERROR SETTING UP REQUEST ---
      console.error("❌ Error setting up request to Python API:", scanError.message);
      return { isClean: false, details: `Scan setup failed: ${scanError.message}` };
    }
    // --- END IMPROVED ERROR LOGGING ---
  }
};
  // --- END NEW FUNCTION ---

  const handleSend = async () => {
    if (!text && !file) return;

    let loadingToast;
    try {
      setIsEncrypting(true);
      // Update loading message to reflect potential scanning
      loadingToast = toast.loading(file ? "Scanning & Encrypting..." : "Sending...");

      let fileData = null;

      if (file) {
        // --- NEW STEP: MALWARE SCAN ---
        const scanResult = await scanFileForMalware(file);
        if (!scanResult.isClean) {
          toast.error(`Malware detected: ${scanResult.details}`);
          // Stop the sending process
          return;
        }
        toast.success("File scan complete. Safe to send.");
        // Consider updating the loading toast message again if scan took a while
        // loadingToast = toast.loading("Encrypting...", { id: loadingToast });
        // --- END NEW STEP ---

        // --- EXISTING E2E ENCRYPTION LOGIC (Steps 1-5) ---
        // Step 1: Load recipient public key
        if (
          !selectedUser?.publicKey ||
          typeof selectedUser.publicKey !== "string" ||
          selectedUser.publicKey.trim() === ""
        ) {
          throw new Error("Recipient's public key is missing or invalid.");
        }

        const recipientPubKeyRaw = base64ToArrayBuffer(selectedUser.publicKey);
        if (recipientPubKeyRaw.byteLength !== 65) {
          console.error("Invalid base64 or key length for publicKey:", selectedUser.publicKey);
          throw new Error("Recipient's public key is not valid or has wrong length.");
        }

        const recipientPublicKey = await window.crypto.subtle.importKey(
          "raw",
          recipientPubKeyRaw,
          { name: "ECDH", namedCurve: "P-256" },
          false,
          []
        );

        // Step 2: Load or generate our private key
        const localPrivateKeyBase64 = localStorage.getItem("privateKey");
        if (!localPrivateKeyBase64) {
          throw new Error("Private key missing. Please login again.");
        }

        const localPrivateKeyRaw = base64ToArrayBuffer(localPrivateKeyBase64);
        const localPrivateKey = await window.crypto.subtle.importKey(
          "pkcs8",
          localPrivateKeyRaw,
          { name: "ECDH", namedCurve: "P-256" },
          false,
          ["deriveKey"]
        );

        // Step 3: Derive shared AES-GCM key
        const aesKey = await window.crypto.subtle.deriveKey(
          {
            name: "ECDH",
            public: recipientPublicKey,
          },
          localPrivateKey,
          { name: "AES-GCM", length: 256 },
          false,
          ["encrypt"]
        );
        console.log("✅ AES key for file encryption derived.");
// --- ADD THIS LOG ---
console.log("🔍 Encryption AES Key Debug:", {
  algorithm: aesKey.algorithm,
  type: aesKey.type,
  extractable: aesKey.extractable,
  usages: aesKey.usages,
});
        // Step 4: Read file and encrypt
        // Add specific error handling for file reading
        let arrayBuffer;
        try {
          arrayBuffer = await file.arrayBuffer();
        } catch (fileReadError) {
           if (fileReadError.message && fileReadError.message.includes("could not be read")) {
             throw new Error("Cannot access the selected file. It might have been moved, deleted, or permissions changed. Please select the file again.");
           } else {
             throw new Error(`Failed to read file: ${fileReadError.message || 'Unknown error'}`);
           }
        }

        const iv = window.crypto.getRandomValues(new Uint8Array(12)); // 96-bit IV
        const encryptedFileBuffer = await window.crypto.subtle.encrypt(
          {
            name: "AES-GCM",
            iv,
          },
          aesKey,
          arrayBuffer
        ); 
        // step new ot store locally
         const encryptedFileBase64 = arrayBufferToBase64(encryptedFileBuffer);
          fileData = {
          name: file.name,
          mimeType: file.type,
          iv: arrayBufferToBase64(iv), // IV used for file encryption
          encrypted: true,
          buffer: encryptedFileBase64, // Send the encrypted file data as Base64 string
          // filename: null, // Will be assigned by the backend
          // url: null,      // Will be assigned by the backend (e.g., /api/files/<filename>)
        };

        // // Step 5: Upload encrypted file to Cloudinary
        // const blob = new Blob([encryptedFileBuffer], { type: file.type });
        // const formData = new FormData();
        // formData.append("file", blob);
        // formData.append("upload_preset", "chatapp"); // 🔁 Replace with your preset

        // // ⚠️ Ensure Cloudinary URL is correct (no trailing spaces!)
        // const cloudRes = await axios.post(
        //   "https://api.cloudinary.com/v1_1/dkklhapof/raw/upload", // 🔁 Corrected URL
        //   formData
        // );

        // if (!cloudRes.data.secure_url) {
        //   throw new Error("File upload failed: No URL returned");
        // }

        // fileData = {
        //   url: cloudRes.data.secure_url,
        //   name: file.name,
        //   mimeType: file.type,
        //   iv: arrayBufferToBase64(iv),
        //   encrypted: true,
        // };

        console.log("📦 Encrypted file uploaded:", fileData);
        // --- END EXISTING E2E ENCRYPTION LOGIC ---
      }

      if (!text.trim() && !fileData) {
        throw new Error("No content to send.");
      }

      console.log("🚀 Sending message", {
        text: text.trim(),
        fileData,
      });

      if (fileData) {
    console.log("📤 File data being sent to backend sendMessage:", fileData);
    // Check if 'iv' is present and a string here
}

      await sendMessage({
        text: text.trim() || null,
        file: fileData,
      });

      toast.success("Message sent!");
      setText("");
      setFile(null);
      setFilePreview(null); // Clear preview on success
      if (fileInputRef.current) fileInputRef.current.value = null;

    } catch (err) {
      console.error("❌ Error sending message:", err);
      toast.error(err.message || "Failed to send message. Please try again.");
    } finally {
      if (loadingToast) toast.dismiss(loadingToast);
      setIsEncrypting(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="p-4 border-t flex flex-col gap-2">
      {filePreview && file && ( // Ensure file exists before accessing .size
        <div className="flex items-center justify-between bg-gray-100 p-2 rounded-md">
          <div className="flex items-center gap-2">
            <span className="text-sm truncate max-w-xs">{file.name}</span>
            <span className="text-xs text-gray-500">({(file.size / 1024).toFixed(1)} KB)</span>
          </div>
          <button onClick={clearFile} className="text-red-500" type="button"> {/* Add type="button" */}
            <FaTimes />
          </button>
        </div>
      )}

      <div className="flex items-center gap-2">
        <input
          type="file"
          ref={fileInputRef}
          className="hidden"
          onChange={handleFileChange}
        />
        <button type="button" onClick={() => fileInputRef.current?.click()} disabled={isEncrypting}>
          <FaPaperclip className="text-gray-600 hover:text-black" />
        </button>

        <input
          type="text"
          placeholder="Type a message..."
          className="flex-1 border rounded-full px-4 py-2 outline-none"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          // Aligns with Knowledge Base Point 2 (Accessibility)
          autoComplete="off" // Prevents autofill, suitable for chat input
          disabled={isEncrypting}
        />

        <button
          type="button"
          onClick={handleSend}
          className="bg-emerald-500 text-white p-2 rounded-full hover:bg-emerald-600 disabled:opacity-50"
          disabled={isEncrypting || (!text.trim() && !file)}
        >
          <BsSend />
        </button>
      </div>
    </div>
  );
};

export default MessageInput;