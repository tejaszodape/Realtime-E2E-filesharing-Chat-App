import jwt from "jsonwebtoken";

export const generateToken = (userId, res) => {
  const token = jwt.sign({ userId }, process.env.JWT_SECRET, {
    expiresIn: "7d",
  });

  res.cookie("jwt", token, {
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days in ms
    httpOnly: true, // Can't be accessed via JavaScript
    sameSite: "Lax", // more lenient than 'strict' and still safe for most cases
    secure: process.env.NODE_ENV === "production", // true in production only
  });

  return token;
};
