

// ChatContainer.jsx
import { useChatStore } from "../store/useChatStore";
import { useEffect, useRef, useState } from "react"; // Add useState if needed for local state
import ChatHeader from "./ChatHeader";
import MessageSkeleton from "./skeletons/MessageSkeleton";
import { useAuthStore } from "../store/useAuthStore";
import { formatMessageTime } from "../lib/utils";
import MessageInput from "./MessageInput";
import toast from "react-hot-toast";
// Import necessary Web Crypto API utilities (these should match your signup/login helpers)
// Assuming base64ToArrayBuffer is available in scope or imported
// If not, define it here or import it
// In ChatContainer.jsx

const base64ToArrayBuffer = (base64) => {
  // Use a regex to remove any character that is NOT a valid Base64 character
  const sanitizedBase64 = base64.replace(/[^A-Za-z0-9+/=]/g, "");

  try {
    const binaryString = atob(sanitizedBase64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
  } catch (error) {
    console.error("Failed to decode Base64 string after sanitization:", error);
    console.error("Sanitized string snippet:", sanitizedBase64.substring(0, 100) + "...");
    throw error; // Re-throw the error after logging
  }
};

const ChatContainer = () => {
  const {
    messages,
    isMessagesLoading,
    selectedUser,
    subscribeToMessages,
    unsubscribeFromMessages,
    // Assume users list is available to find sender's public key
    // If not directly available, you might need to fetch it or ensure it's in the message
    users,
  } = useChatStore();

  const { authUser, privateKey } = useAuthStore(); // Get privateKey
  const messageEndRef = useRef(null);
 // Optional: Add state for decryption loading/errors per message
  // const [decryptionStates, setDecryptionStates] = useState({});

 
const decryptAndDownloadFile = async (messageFileData, messageSenderId) => {
  console.log("📥 Initiating file decryption for:", messageFileData.name);
  console.log("📥 decryptAndDownloadFile called with messageFileData:", JSON.parse(JSON.stringify(messageFileData))); // Deep clone to avoid proxy issues in logs
  console.log("🔍 Inspecting messageFileData.iv:", messageFileData.iv);

  // --- 1. Get Latest State ---
  const { privateKey, authUser } = useAuthStore.getState();
  const { selectedUser, users } = useChatStore.getState();

  if (!privateKey) {
    console.error("❌ User's private key not found.");
    toast.error("Cannot decrypt file: Your private key is missing. Please log in again.");
    return;
  }

  const currentUserId = authUser?._id;
  console.log("👤 Current User ID (from state):", currentUserId);

  let otherPartyPublicKeyBase64 = null;

  try {
    // --- 2. Determine the OTHER party's public key based on role ---
    if (messageSenderId === currentUserId) {
      // --- CURRENT USER IS THE SENDER ---
      console.log("👤 User is the SENDER. Need RECIPIENT's public key.");
      otherPartyPublicKeyBase64 = selectedUser?.publicKey;
      if (!otherPartyPublicKeyBase64) {
        throw new Error("Recipient's public key not found (Sender view). Is a chat partner selected?");
      }
    } else {
      // --- CURRENT USER IS THE RECIPIENT ---
      console.log("👤 User is the RECIPIENT. Need SENDER's public key.");
      const senderUser = users?.find(user => user._id === messageSenderId);
      otherPartyPublicKeyBase64 = senderUser?.publicKey;
      if (!otherPartyPublicKeyBase64) {
        throw new Error("Sender's public key not found in user list (Recipient view). Ensure user data is loaded correctly.");
      }
    }
    console.log("✅ Other party's public key obtained.");
    console.log("🔍 DEBUG: otherPartyPublicKeyBase64 after retrieval:", otherPartyPublicKeyBase64?.substring(0, 30) + '...'); // Log preview

    // --- CRITICAL CHECK ---
    if (!otherPartyPublicKeyBase64) {
       console.error("❌ FATAL: otherPartyPublicKeyBase64 is NULL or UNDEFINED after retrieval logic!");
       toast.error("Cannot decrypt file: Failed to obtain the other party's public key.");
       return; // Stop execution
    }
    if (typeof otherPartyPublicKeyBase64 !== 'string') {
        console.error("❌ FATAL: otherPartyPublicKeyBase64 is not a string!", typeof otherPartyPublicKeyBase64, otherPartyPublicKeyBase64);
        toast.error("Cannot decrypt file: Invalid public key format.");
        return;
    }
    // --- END CRITICAL CHECK ---

    // --- 3. Validate required data from message metadata ---
    if (!messageFileData.iv) {
      throw new Error("File IV (initialization vector) is missing from message data.");
    }
    if (!messageFileData.filename) { // Use filename, not url
      throw new Error("File identifier (filename) is missing from message data.");
    }
    console.log("✅ Required message metadata validated.");

    // --- 4. Derive Shared Key using ECDH ---
    console.log("🔑 Deriving shared AES key using ECDH...");
    console.log("🔑 ECDH Key Derivation Inputs:");
    console.log("   My Private Key (Base64 preview):", privateKey?.substring(0, 30) + '...');
    console.log("   Other Party Public Key (Base64 preview):", otherPartyPublicKeyBase64?.substring(0, 30) + '...');

    const myPrivateKeyBuffer = base64ToArrayBuffer(privateKey);
    const otherPartyPublicKeyBuffer = base64ToArrayBuffer(otherPartyPublicKeyBase64);

    const myPrivateKey = await window.crypto.subtle.importKey(
      "pkcs8", myPrivateKeyBuffer, { name: "ECDH", namedCurve: "P-256" },
      false, ["deriveKey"]
    );

    const otherPartyPublicKey = await window.crypto.subtle.importKey(
      "raw", otherPartyPublicKeyBuffer, { name: "ECDH", namedCurve: "P-256" },
      false, []
    );

    const sharedKey = await window.crypto.subtle.deriveKey(
      { name: "ECDH", public: otherPartyPublicKey },
      myPrivateKey,
      { name: "AES-GCM", length: 256 },
      false, ["decrypt"]
    );
    console.log("✅ Shared AES key derived successfully.");

    // --- 5. Fetch Encrypted File Content from LOCAL BACKEND ENDPOINT ---
   const fileDownloadUrl = `/api/files/${encodeURIComponent(messageFileData.filename)}`;
    console.log("📥 Fetching encrypted file from local backend:", fileDownloadUrl);
    const response = await fetch(fileDownloadUrl);
    if (!response.ok) {
      if (response.status === 403) {
        throw new Error("Access denied to this file.");
      } else if (response.status === 404) {
         throw new Error("File not found.");
      } else {
        throw new Error(`Failed to fetch encrypted file: ${response.statusText}`);
      }
    }
    // const encryptedFileBuffer = await response.arrayBuffer();
    // const encryptedFileAsBase64Text = await response.text();
    // console.log("RAW TEXT FROM SERVER:", encryptedFileAsBase64Text);
    const encryptedFileBuffer = await response.arrayBuffer();

    console.log("✅ Encrypted file fetched successfully. Size:", encryptedFileBuffer.byteLength, "bytes");

    // --- 6. Decode IV ---
    console.log("🔢 Decoding Initialization Vector (IV)...");
    const ivBuffer = base64ToArrayBuffer(messageFileData.iv);
    console.log("✅ IV decoded. Length:", ivBuffer.byteLength, "bytes (Should be 12 for AES-GCM)");

    // --- 7. --- SANITY CHECKS BEFORE DECRYPT ---
    console.log("--- SANITY CHECKS BEFORE DECRYPT ---");
    // 1. Check Key Object Properties (Don't log the key material!)
    if (!sharedKey || typeof sharedKey !== 'object' || !sharedKey.algorithm) {
      console.error("❌ FATAL: sharedKey is invalid:", sharedKey);
      throw new Error("Decryption setup failed: Invalid shared key object.");
    }
    console.log("✅ Shared Key Object OK");

    // 2. Check IV Buffer
    if (!(ivBuffer instanceof ArrayBuffer)) {
      console.error("❌ FATAL: ivBuffer is not an ArrayBuffer:", ivBuffer);
      throw new Error("Decryption setup failed: IV is not in the correct format.");
    }
    if (ivBuffer.byteLength !== 12) {
      console.error(`❌ FATAL: IV length is ${ivBuffer.byteLength}, expected 12 bytes.`);
      throw new Error(`Decryption setup failed: Invalid IV length (${ivBuffer.byteLength} bytes). Expected 12 bytes for AES-GCM.`);
    }
    console.log("✅ IV Buffer OK (Length:", ivBuffer.byteLength, ")");

    // 3. Check Encrypted Data Buffer
    if (!(encryptedFileBuffer instanceof ArrayBuffer)) {
      console.error("❌ FATAL: encryptedFileBuffer is not an ArrayBuffer:", encryptedFileBuffer);
      throw new Error("Decryption setup failed: Encrypted data is not in the correct format.");
    }
    if (encryptedFileBuffer.byteLength <= 0) {
       console.warn("⚠️ WARNING: Encrypted file buffer is empty or negative size:", encryptedFileBuffer.byteLength);
       // You might choose to throw an error here depending on your logic
    }
    console.log("✅ Encrypted Data Buffer OK (Length:", encryptedFileBuffer.byteLength, " bytes)");
    console.log("--- END SANITY CHECKS ---");

    // --- LOG PARAMETERS FOR VISUAL INSPECTION ---
    console.log("🔐 DECRYPT PARAMETERS:");
    console.log("   Key Algorithm:", sharedKey.algorithm);
    console.log("   Key Type:", sharedKey.type);
    console.log("   IV (hex preview):", Array.from(new Uint8Array(ivBuffer)).map(b => b.toString(16).padStart(2, '0')).join('').substring(0, 24) + '...');
    console.log("   Data Length:", encryptedFileBuffer.byteLength);
    console.log("---------------------------");

    console.log("🔓 ATTEMPTING window.crypto.subtle.decrypt...");
    const startTime = performance.now();
    

    console.log("✅ Shared AES key derived successfully.");
// --- ADD THIS LOG ---
console.log("🔍 Decryption Shared Key Debug:", {
  algorithm: sharedKey.algorithm,
  type: sharedKey.type,
  extractable: sharedKey.extractable,
  usages: sharedKey.usages,
});


    try {
      // --- THE ACTUAL DECRYPTION CALL ---
      const decryptedFileBuffer = await window.crypto.subtle.decrypt(
        {
          name: "AES-GCM",
          iv: ivBuffer, // Pass the ArrayBuffer directly
        },
        sharedKey, // Use the derived shared key
        encryptedFileBuffer // Pass the ArrayBuffer directly
      );
      // --- END DECRYPTION CALL ---
      const endTime = performance.now();
      console.log(`✅ DECRYPTION SUCCESSFUL! Took ${(endTime - startTime).toFixed(2)} milliseconds.`);
      console.log("📂 Decrypted File Buffer Length:", decryptedFileBuffer.byteLength, "bytes");

      // --- 8. Create Blob and Trigger Download ---
      const decryptedBlob = new Blob([decryptedFileBuffer], { type: messageFileData.mimeType || 'application/octet-stream' });
      const objectUrl = URL.createObjectURL(decryptedBlob);

      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = messageFileData.name || 'decrypted_file'; // Use original filename or a default
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      // Clean up the object URL to release memory
      URL.revokeObjectURL(objectUrl);
      console.log("💾 File download triggered successfully.");

      toast.success("File decrypted and downloaded!");

    } catch (decryptError) {
      const endTime = performance.now();
      console.error(`⏱️ Decrypt call duration before failure: ${(endTime - startTime).toFixed(2)} ms.`);
      console.error("💥💥💥 CRITICAL DECRYPTION ERROR (AT TIME OF CALL) 💥💥💥");
      console.error("❌ Decryption failed in ChatContainer.jsx decryptAndDownloadFile:", decryptError);
      console.error("Type of error:", decryptError.constructor?.name || typeof decryptError);
      console.error("Error name:", decryptError.name); // Should be 'OperationError'
      console.error("Error message:", decryptError.message); // Might be empty

      let userFriendlyMessage = "Failed to decrypt file.";
      if (decryptError.name === 'OperationError') {
        // This often points to a problem with the inputs *at the time of the call*.
        userFriendlyMessage += " A critical error occurred during decryption. This usually means the decryption key, IV, or file data is incorrect or corrupted.";
        console.warn("⚠️ Likely causes of OperationError at decrypt() call:");
        console.warn("   1. The shared ECDH key is incorrect (wrong key pair used for derivation).");
        console.warn("   2. The IV buffer is incorrect (wrong bytes or length).");
        console.warn("   3. The encrypted file data buffer is corrupted or doesn't match what was encrypted.");
        console.warn("   4. Mismatch between encryption parameters (AES-GCM) and decryption call.");
        console.warn("👉 ACTION: Compare the key derivation steps, IV, and encrypted data size between MessageInput.jsx (encryption) and here (decryption).");
        console.warn("👉 CHECK LOGS ABOVE: Ensure 'Shared Key Algorithm' is 'AES-GCM', 'Decoded IV Length' is 12, and 'Encrypted File Buffer Length' is > 0.");
      } else if (decryptError.name === 'DataError') {
         userFriendlyMessage += " Decryption failed unexpectedly. The file might be corrupted.";
      } else if (decryptError.message) {
         userFriendlyMessage = decryptError.message; // Use specific message if available
      }

      toast.error(userFriendlyMessage);
      // ... rest of error handling ...
    }

  } catch (error) {
    console.error("❌ Decryption failed in decryptAndDownloadFile:", error);
    // Check for specific Base64 decoding errors
    if (error.message && (error.message.includes("The string to be decoded is not correctly encoded") || error.name === 'InvalidCharacterError')) {
        toast.error("Cannot decrypt file: Invalid data format (e.g., corrupt Base64 for key/IV).");
    } else if (error.message && error.message.includes("DataError")) {
         toast.error("Cannot decrypt file: Decryption failed. The file might be corrupted or the keys are mismatched.");
    } else {
        toast.error("Failed to decrypt file: " + (error.message || "Unknown error"));
    }
  }
};
// --- END OF decryptAndDownloadFile ---
// --- END OF decryptAndDownloadFile ---

//  const decryptAndDownloadFile = async (messageFileData, senderId) => {
//     // messageFileData = { name, mimeType, iv, encrypted, filename, ... }
//     console.log(" Initiating file decryption for:", messageFileData.name);

//     const { privateKey, authUser, users } = useAuthStore.getState(); // Get latest state
//     if (!privateKey) {
//       console.error("❌ Recipient's private key not found.");
//       alert("Cannot decrypt file: Private key missing. Please log in again.");
//       return;
//     }

//     const currentUserId = authUser?._id;
//     let otherPartyPublicKeyBase64 = null;

//     try {
//       // --- 1. Determine the OTHER party's public key based on role ---
//       if (senderId === currentUserId) {
//         // --- CURRENT USER IS THE SENDER ---
//         console.log(" User is the SENDER. Need RECIPIENT's public key.");
//         const { selectedUser } = useChatStore.getState();
//         otherPartyPublicKeyBase64 = selectedUser?.publicKey;
//         if (!otherPartyPublicKeyBase64) {
//            throw new Error("Recipient's public key not found (Sender view).");
//         }
//       } else {
//         // --- CURRENT USER IS THE RECIPIENT ---
//         console.log(" User is the RECIPIENT. Need SENDER's public key.");
//         const senderUser = users?.find(user => user._id === senderId);
//         otherPartyPublicKeyBase64 = senderUser?.publicKey;
//         if (!otherPartyPublicKeyBase64) {
//            throw new Error("Sender's public key not found in user list (Recipient view).");
//         }
//       }
//       console.log("✅ Other party's public key obtained.");

//       // --- 2. Validate required data ---
//       if (!messageFileData.iv) {
//           throw new Error("File IV (initialization vector) is missing from message data.");
//       }
//       if (!messageFileData.filename) { // Use filename instead of url
//           throw new Error("File identifier (filename) is missing from message data.");
//       }

//       // --- 3. Derive Shared Key using ECDH ---
//       console.log("🔑 Deriving shared key...");
//       const myPrivateKeyBuffer = base64ToArrayBuffer(privateKey);
//       const otherPartyPublicKeyBuffer = base64ToArrayBuffer(otherPartyPublicKeyBase64);

//       const myPrivateKey = await window.crypto.subtle.importKey(
//         "pkcs8", myPrivateKeyBuffer, { name: "ECDH", namedCurve: "P-256" },
//         false, ["deriveKey"]
//       );

//       const otherPartyPublicKey = await window.crypto.subtle.importKey(
//         "raw", otherPartyPublicKeyBuffer, { name: "ECDH", namedCurve: "P-256" },
//         false, []
//       );

//       const sharedKey = await window.crypto.subtle.deriveKey(
//         { name: "ECDH", public: otherPartyPublicKey },
//         myPrivateKey,
//         { name: "AES-GCM", length: 256 },
//         false, ["decrypt"]
//       );
//       console.log("✅ Shared key derived.");

//       // --- 4. Fetch Encrypted File Content from LOCAL ENDPOINT ---
//       // Use the filename to construct the URL to your new backend endpoint
//       const fileDownloadUrl = `/api/messages/files/${messageFileData.filename}`; // Adjust path if needed
//       console.log("📥 Fetching encrypted file from local endpoint:", fileDownloadUrl);
//       const response = await fetch(fileDownloadUrl);
//       if (!response.ok) {
//         // Handle specific errors (403, 404) gracefully
//         if (response.status === 403) {
//             throw new Error("Access denied to this file.");
//         } else if (response.status === 404) {
//              throw new Error("File not found.");
//         } else {
//             throw new Error(`Failed to fetch encrypted file: ${response.statusText}`);
//         }
//       }
//       const encryptedFileBuffer = await response.arrayBuffer(); // Get raw bytes
//       console.log("✅ Encrypted file fetched.");

//       // --- 5. Decode IV ---
//       console.log("🔢 Decoding IV...");
//       const ivBuffer = base64ToArrayBuffer(messageFileData.iv);
//       console.log("✅ IV decoded.");

//       // new one 
//       try {
//   console.log("🔍 Preparing decryption parameters:");
//   console.log("   Shared Key Algorithm:", sharedKey.algorithm);
//   console.log("   Shared Key Type:", sharedKey.type);
//   console.log("   IV Length (bytes):", ivBuffer?.byteLength); // Should be 12
//   console.log("   Encrypted Data Length (bytes):", encryptedFileBuffer?.byteLength);

//   if (!sharedKey || !ivBuffer || !encryptedFileBuffer) {
//       throw new Error("Missing required parameters for decryption (key, iv, or data).");
//   }
//   if (ivBuffer.byteLength !== 12) {
//        console.warn("⚠️ IV length is not 12 bytes, which is standard for AES-GCM.");
//   }

//   console.log("🔓 Calling window.crypto.subtle.decrypt...");
//   const decryptedFileBuffer = await window.crypto.subtle.decrypt(
//     {
//       name: "AES-GCM",
//       iv: ivBuffer, // Pass the ArrayBuffer directly
//     },
//     sharedKey,
//     encryptedFileBuffer // Pass the ArrayBuffer directly
//   );
//   console.log("✅ File content decrypted successfully.");
//   // ... rest of success logic (create blob, download) ...
// } catch (decryptError) {
//   console.error("❌ Decryption failed in ChatContainer.jsx decryptAndDownloadFile:", decryptError);
//   // Provide a more user-friendly message, but log the full error
//    if (decryptError.name === 'OperationError') {
//       // This often points to key mismatch, wrong IV, or corrupted data/tag issues
//       toast.error("Failed to decrypt file. The file might be corrupted, the keys might be mismatched, or decryption parameters are incorrect.");
//    } else {
//       toast.error("Failed to decrypt file: " + (decryptError.message || "Unknown error"));
//    }
//   // ... error handling ...
// }
//       // --- 6. Decrypt File Content ---
//       console.log("🔓 Decrypting file content...");
//       const decryptedFileBuffer = await window.crypto.subtle.decrypt(
//         { name: "AES-GCM", iv: ivBuffer },
//         sharedKey,
//         encryptedFileBuffer
//       );
//       console.log("✅ File content decrypted.");

//       // --- 7. Create Blob and Trigger Download ---
//       const decryptedBlob = new Blob([decryptedFileBuffer], { type: messageFileData.mimeType });
//       const objectUrl = URL.createObjectURL(decryptedBlob);
//       const link = document.createElement('a');
//       link.href = objectUrl;
//       link.download = messageFileData.name; // Use original filename
//       document.body.appendChild(link);
//       link.click();
//       document.body.removeChild(link);
//       URL.revokeObjectURL(objectUrl); // Clean up
//       console.log("💾 File download triggered.");

//     } catch (error) {
//       console.error("❌ Decryption failed:", error);
//       // Check for specific Base64 decoding errors
//       if (error.message && (error.message.includes("The string to be decoded is not correctly encoded") || error.name === 'InvalidCharacterError')) {
//           alert("Cannot decrypt file: Invalid data format (e.g., corrupt Base64 for key/IV).");
//       } else if (error.message && error.message.includes("DataError")) {
//            alert("Cannot decrypt file: Decryption failed. The file might be corrupted or the keys are mismatched.");
//       } else {
//           alert("Failed to decrypt file: " + (error.message || "Unknown error"));
//       }
//     }
//   };
  // --- END NEW FUNCTION ---

  // Fetch messages and subscribe on mount/change
  useEffect(() => {
    if (!selectedUser?._id) return;

    console.log("🔄 ChatContainer: Selected user changed, setting up chat");
    subscribeToMessages();

    return () => {
      console.log("🧹 ChatContainer: Cleaning up subscriptions");
      unsubscribeFromMessages();
    };
  }, [selectedUser?._id]);

  // Scroll to bottom when new messages come
  useEffect(() => {
    if (messageEndRef.current && messages) {
      messageEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  if (isMessagesLoading) {
    return (
      <div className="flex-1 flex flex-col overflow-auto">
        <ChatHeader />
        <MessageSkeleton />
      </div>
    );
  }

  if (!selectedUser) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <h3 className="text-xl font-semibold">Welcome to ChatApp</h3>
          <p className="text-gray-500">Select a user to start messaging</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <ChatHeader />

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages && messages.length > 0 ? (
          messages.map((message) => (
            <div
              key={message._id}
              className={`chat ${message.senderId === authUser?._id ? "chat-end" : "chat-start"}`}
            >
              <div className="chat-image avatar">
                <div className="size-10 rounded-full border">
                  <img
                    src={
                      message.senderId === authUser?._id
                        ? authUser?.profilePic || "/avatar.png"
                        : selectedUser?.profilePic || "/avatar.png"
                    }
                    alt="Profile pic"
                    onError={(e) => {
                      e.target.src = "/avatar.png";
                    }}
                  />
                </div>
              </div>

              <div className="chat-header mb-1">
                <time className="text-xs opacity-50 ml-1">
                  {formatMessageTime(message.createdAt)}
                </time>
              </div>

              <div className="chat-bubble flex flex-col gap-2 max-w-sm break-words">
                {/* Text Message */}
                {message.text && <p>{message.text}</p>}

                {/* File Attachment */}

                {message.file && (
                  // --- REPLACED DIRECT LINK WITH BUTTON ---
                  <button
                    onClick={() => decryptAndDownloadFile(message.file, message.senderId)}
                 
                    className="text-blue-500 underline text-sm flex items-center gap-1"
                    // Optional: Disable while decryption logic runs
                    // disabled={isDecrypting} 
                  >
                    
                    {/* Optional loading indicator */}
                    {/* {isDecrypting ? <Loader2 className="size-4 animate-spin" /> : '📎'} */}
                    📎 Download {message.file.name}
                  </button>

                  // --- END REPLACEMENT ---



                  // // for downloading the encryted file using url{
                  //   <a
                  //   href={message.file.url}
                  //   download={message.file.name}
                  //   className="text-blue-500 underline text-sm"
                  // >
                  //   📎 Download {message.file.name}
                  // </a>
                  // // }

                  
                )}

                  

                {/* Image Message */}
                {message.image && (
                  <img
                    src={message.image}
                    alt="Attachment"
                    className="sm:max-w-[200px] rounded-md"
                    onError={(e) => {
                      e.target.src = "/placeholder-image.png";
                    }}
                  />
                )}
              </div>
            </div>
          ))
        ) : (
          <div className="flex items-center justify-center h-full">
            <p className="text-gray-500">No messages yet. Start the conversation!</p>
          </div>
        )}
        <div ref={messageEndRef} />
      </div>

      <MessageInput />
    </div>
  );
};

export default ChatContainer;