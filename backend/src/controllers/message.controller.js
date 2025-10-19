
// controllers/message.controller.js
// controllers/message.controller.js// controllers/message.controller.js
import User from "../models/user.model.js";
import Message from "../models/message.model.js";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from 'url';
import { v4 as uuidv4 } from 'uuid';
import { getReceiverSocketId, io } from "../lib/socket.js";
import {protectRoute} from '../middleware/auth.middleware.js';

// --- CORRECTED IMPORT ---
// This matches your actual middleware file path and default export
// --- END CORRECTED IMPORT ---

// --- Setup for ES Modules ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const UPLOADS_DIR = path.join(__dirname, '..', 'uploads'); // Path to local uploads folder

// Ensure uploads directory exists when the module loads
(async () => {
  try {
    await fs.access(UPLOADS_DIR);
    console.log(`📁 Uploads directory confirmed: ${UPLOADS_DIR}`);
  } catch (err) {
    console.log(`📁 Creating uploads directory: ${UPLOADS_DIR}`);
    await fs.mkdir(UPLOADS_DIR, { recursive: true });
  }
})();
// --- End Setup ---

export const getUsersForSidebar = async (req, res) => {
  try {
    const loggedInUserId = req.user._id;
    const filteredUsers = await User.find({ _id: { $ne: loggedInUserId } }).select("-password");
    res.status(200).json(filteredUsers);
  } catch (error) {
    console.error("Error in getUsersForSidebar: ", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};

export const getMessages = async (req, res) => {
  try {
    const { id: userToChatId } = req.params;
    const myId = req.user._id;

    const messages = await Message.find({
      $or: [
        { senderId: myId, receiverId: userToChatId },
        { senderId: userToChatId, receiverId: myId },
      ],
    });

    res.status(200).json(messages);
  } catch (error) {
    console.log("Error in getMessages controller: ", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};

// --- NEW: Endpoint to serve locally stored files ---
// Protected by the corrected middleware import
export const serveFile = async (req, res) => {
   try {
    const { filename } = req.params;
    const userId = req.user._id; // Available because route is protected

    // --- Authorization Check ---
    // Ensure the requesting user is either the sender or receiver of the message
    // containing this file.
    const message = await Message.findOne({
        'file.filename': filename, // Match the stored local filename
         $or: [
            { senderId: userId },
            { receiverId: userId }
         ]
    }).select('senderId receiverId file.mimeType'); // Only select needed fields

    if (!message) {
         console.warn(`⚠️ Unauthorized or not found file access attempt by user ${userId} for ${filename}`);
         return res.status(404).json({ error: "File not found or access denied." });
    }
    // --- End Authorization Check ---

    const filePath = path.join(UPLOADS_DIR, filename);

    // Optional: Check if file exists on disk before attempting to send
    try {
        await fs.access(filePath);
    } catch (accessErr) {
        console.error(`❌ File not found on disk: ${filePath}`, accessErr?.message || accessErr);
        return res.status(404).json({ error: "File not found on server." });
    }

    // Set the correct Content-Type header for the file
    const mimeType = message.file?.mimeType || 'application/octet-stream';
    res.setHeader('Content-Type', mimeType);

    // Stream the file directly to the client
    console.log(`📤 Serving file: ${filename} to user ${userId}`);
    res.sendFile(filePath, (err) => {
        if (err) {
            console.error(`❌ Error sending file ${filename}:`, err);
            // Avoid sending headers if they've already been sent (e.g., by sendFile error)
            if (!res.headersSent) {
                if (err.code === 'ENOENT') {
                    return res.status(404).json({ error: "File not found on server (sendFile)." });
                }
                return res.status(500).json({ error: "Failed to retrieve file (sendFile)." });
            }
        }
        // File sent successfully
        console.log(`✅ File sent successfully: ${filename}`);
        // Note: res.sendFile handles ending the response, so no res.end() needed here.
    });

  } catch (error) {
    console.error("❌ Error in serveFile controller:", error);
    // Check if headers were sent to avoid 'Cannot set headers after they are sent' error
    if (!res.headersSent) {
         res.status(500).json({ error: "Internal server error while retrieving file." });
    }
    // If headers were sent, the error likely occurred after sending started,
    // and sendFile might have already handled the response.
  }
};
// --- END NEW: serveFile ---


export const sendMessage = async (req, res) => {
  try {
    // Expect 'file' to contain data prepared by frontend for local storage:
    // { name, mimeType, iv, encrypted: true, buffer: Base64String }
    const { text, image, file } = req.body;
    const { id: receiverId } = req.params;
    const senderId = req.user._id;

    let imageUrl = null; // Initialize imageUrl
    // Handle image upload (currently uses Cloudinary, adapt if needed for local storage)
    if (image) {
      // Example using Cloudinary for images (keep or replace with local logic)
      const cloudinary = (await import("../lib/cloudinary.js")).default; // Dynamic import if needed
      const uploadResponse = await cloudinary.uploader.upload(image);
      imageUrl = uploadResponse.secure_url;
    }

    let savedFileData = null;
    // --- Handle Local File Storage for 'file' attachment ---
    if (file) {
        // Validate required fields for local file storage
        if (!file.name || !file.mimeType || !file.iv || !file.encrypted || !file.buffer) {
             console.error("❌ Incomplete file data received for local storage:", file);
             return res.status(400).json({ error: "Incomplete file data received for local storage." });
        }

        let bufferToWrite;
        // Convert the Base64 buffer string (sent from frontend) to a Node.js Buffer
        if (typeof file.buffer === 'string') {
            try {
                bufferToWrite = Buffer.from(file.buffer, 'base64');
            } catch (base64Error) {
                 console.error("❌ Invalid Base64 buffer string for file:", base64Error);
                 return res.status(400).json({ error: "Invalid file buffer format (expected Base64 string)." });
            }
        } else {
             console.error("❌ File buffer must be a Base64 string for local storage.");
             return res.status(400).json({ error: "File buffer must be a Base64 string." });
        }

        // Generate a unique filename to prevent conflicts
        const uniqueFilename = `${uuidv4()}_${file.name}`;
        const filePath = path.join(UPLOADS_DIR, uniqueFilename);

        try {
            // Write the encrypted file buffer to the local filesystem
            await fs.writeFile(filePath, bufferToWrite);
            console.log(`✅ Encrypted file saved locally: ${filePath}`);

            // Prepare the file metadata to be stored in the MongoDB Message document
            savedFileData = {
                name: file.name,
                filename: uniqueFilename, // Store the unique local filename
                mimeType: file.mimeType,
                iv: file.iv, // IV is already Base64, store as-is
                encrypted: file.encrypted, // Boolean flag
                // url: `/api/messages/files/${uniqueFilename}`, // Optional: build a relative URL if needed by frontend
            };

        } catch (writeError) {
            console.error("❌ Error saving encrypted file locally:", writeError);
            // Attempt to delete the partially written file if it exists
            try {
                await fs.unlink(filePath);
                console.log(`🗑️ Partial file deleted after write error: ${filePath}`);
            } catch (unlinkErr) {
                console.warn(`⚠️ Could not delete partial file ${filePath} after write error:`, unlinkErr?.message || unlinkErr);
            }
            return res.status(500).json({ error: "Failed to save encrypted file locally." });
        }
    }
    // --- End Handle Local File Storage ---

    // Create the new message document in MongoDB
    const newMessage = new Message({
      senderId,
      receiverId,
      text,
      image: imageUrl, // Cloudinary URL or null
      file: savedFileData, // Local file metadata or null
    });

    // Save the message to the database
    await newMessage.save();

    // Emit the new message to the recipient via Socket.IO
    const receiverSocketId = getReceiverSocketId(receiverId);
    if (receiverSocketId) {
      io.to(receiverSocketId).emit("newMessage", newMessage);
    }

    // Send the saved message (including local file metadata) back to the sender
    res.status(201).json(newMessage);
  } catch (error) {
    console.error("❌ Error in sendMessage controller:", error);
    res.status(500).json({ error: "Internal server error in sendMessage" });
  }
};
