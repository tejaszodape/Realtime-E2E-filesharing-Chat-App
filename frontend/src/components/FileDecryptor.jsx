import { useState } from "react";
import CryptoJS from "crypto-js";
import { Download, Loader2 } from "lucide-react";

const ENCRYPTION_KEY = "your-32-byte-secret-key"; // must match encryption key used during upload

const FileDecryptor = ({ file }) => {
  const [isDecrypting, setIsDecrypting] = useState(false);
  const [downloadUrl, setDownloadUrl] = useState(null);

  const handleDecrypt = async () => {
    try {
      setIsDecrypting(true);
      const res = await fetch(file.url);
      const encryptedText = await res.text();

      const decrypted = CryptoJS.AES.decrypt(encryptedText, ENCRYPTION_KEY);
      const typedArray = CryptoJS.lib.WordArray.create(decrypted.words).toString(CryptoJS.enc.Latin1);
      const blob = new Blob([typedArray]);
      const url = window.URL.createObjectURL(blob);
      setDownloadUrl(url);
    } catch (err) {
      console.error("Decryption failed:", err);
    } finally {
      setIsDecrypting(false);
    }
  };

  return (
    <div className="flex items-center gap-3 p-2 border rounded-lg border-zinc-600 bg-base-200">
      <span className="text-sm truncate">{file.name}</span>
      {downloadUrl ? (
        <a href={downloadUrl} download={file.name} className="btn btn-xs btn-success">
          Download
        </a>
      ) : (
        <button onClick={handleDecrypt} className="btn btn-xs btn-primary" disabled={isDecrypting}>
          {isDecrypting ? <Loader2 className="animate-spin" size={16} /> : <Download size={16} />}
        </button>
      )}
    </div>
  );
};

export default FileDecryptor;
