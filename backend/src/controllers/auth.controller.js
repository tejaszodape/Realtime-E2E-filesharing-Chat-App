import { generateToken } from "../lib/utils.js";
import User from "../models/user.model.js";
import bcrypt from "bcryptjs";
import cloudinary from "../lib/cloudinary.js";

// ---------------------- SIGNUP ----------------------
export const signup = async (req, res) => {
  const {
    name,
    email,
    password,
    publicKey,
    encryptedPrivateKey,
    iv,
    salt,
  } = req.body;

  console.log("📥 Signup request body:", req.body);

  try {
    if (!name || !email || !password || !publicKey || !encryptedPrivateKey || !iv || !salt) {
      return res.status(400).json({
        message: "All fields are required",
        missing: {
          name: !name,
          email: !email,
          password: !password,
          publicKey: !publicKey,
          encryptedPrivateKey: !encryptedPrivateKey,
          iv: !iv,
          salt: !salt,
        },
      });
    }

    if (password.length < 6) {
      return res.status(400).json({ message: "Password must be at least 6 characters" });
    }

    const userExists = await User.findOne({ email });
    if (userExists) {
      return res.status(400).json({ message: "Email already exists" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = new User({
      name,
      email,
      password: hashedPassword,
      publicKey,
      encryptedPrivateKey,
      iv,
      salt,
    });

    await newUser.save();
    generateToken(newUser._id, res);

    console.log("✅ User created:", newUser.email);

    res.status(201).json({
      _id: newUser._id,
      name: newUser.name,
      email: newUser.email,
      profilePic: newUser.profilePic,
      publicKey: newUser.publicKey,
    });
  } catch (error) {
    console.error("❌ Signup Error:", error.message);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

// ---------------------- LOGIN ----------------------
export const login = async (req, res) => {
  const { email, password } = req.body;

  try {
    const user = await User.findOne({ email });

    if (!user) {
      console.log("❌ Login failed: user not found");
      return res.status(400).json({ message: "Invalid credentials" });
    }

    const isPasswordCorrect = await bcrypt.compare(password, user.password);
    if (!isPasswordCorrect) {
      console.log("❌ Login failed: incorrect password");
      return res.status(400).json({ message: "Invalid credentials" });
    }

    generateToken(user._id, res);

    console.log("✅ Login successful for:", user.email);

    res.status(200).json({
      _id: user._id,
      name: user.name,
      email: user.email,
      profilePic: user.profilePic,
      publicKey: user.publicKey,
      encryptedPrivateKey: user.encryptedPrivateKey,
      // Correct mapping in backend response if DB fields are 'salt' and 'iv'
      keySalt: user.salt,
      keyIv: user.iv,
    });
  } catch (error) {
    console.error("❌ Login Error:", error.message);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

// ---------------------- LOGOUT ----------------------
export const logout = (req, res) => {
  try {
    res.cookie("jwt", "", { maxAge: 0 });
    console.log("👋 Logged out");
    res.status(200).json({ message: "Logged out successfully" });
  } catch (error) {
    console.error("❌ Logout error:", error.message);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

// ---------------------- UPDATE PROFILE ----------------------
export const updateProfile = async (req, res) => {
  try {
    const { profilePic } = req.body;
    const userId = req.user._id;

    if (!profilePic) {
      return res.status(400).json({ message: "Profile pic is required" });
    }

    const uploadResponse = await cloudinary.uploader.upload(profilePic);
    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { profilePic: uploadResponse.secure_url },
      { new: true }
    );

    console.log("✅ Profile updated for:", updatedUser.email);

    res.status(200).json(updatedUser);
  } catch (error) {
    console.error("❌ Update profile error:", error.message);
    res.status(500).json({ message: "Internal server error" });
  }
};

// ---------------------- CHECK AUTH ----------------------
export const checkAuth = (req, res) => {
  try {
    console.log("🔒 Auth check success:", req.user?.email);
    res.status(200).json(req.user);
  } catch (error) {
    console.error("❌ Check auth error:", error.message);
    res.status(500).json({ message: "Internal Server Error" });
  }
};
