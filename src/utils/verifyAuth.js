const jwt = require("jsonwebtoken");

const JWT_SECRET = process.env.JWT_SECRET

module.exports = function verifyAuth(event) {
  try {
    const authHeader = event.headers.Authorization || event.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return { valid: false, message: "Missing or invalid Authorization header" };
    }

    const token = authHeader.split(" ")[1];
    const decoded = jwt.verify(token, JWT_SECRET);

    return { valid: true, decoded };
  } catch (err) {
    return { valid: false, message: "Invalid or expired token" };
  }
};
