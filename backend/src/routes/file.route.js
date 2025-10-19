


// In file.route.js

import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { protectRoute } from '../middleware/auth.middleware.js';

const router = express.Router();

// Define __dirname for ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// This assumes your uploaded files are stored in a folder named 'uploads' 
// in the root of your backend project. Adjust if your folder is named differently.
const UPLOADS_DIRECTORY = path.join(__dirname, '..', 'uploads');

// This is the file-serving endpoint. It's now protected.
// It will handle GET requests to /api/files/<some-filename>
router.get('/:filename', protectRoute, (req, res) => {
    const { filename } = req.params;
    const filePath = path.join(UPLOADS_DIRECTORY, filename);

    // This sends the file to the client
    res.sendFile(filePath, (err) => {
        if (err) {
            console.error("Error: Could not send file.", err);
            // Don't send the index.html file here. Just send an error.
            res.status(404).send({ message: "File not found." });
        }
    });
});

export default router;