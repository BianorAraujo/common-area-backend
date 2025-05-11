const express = require("express");
const passport = require("../auth");
const { generateToken } = require("../utils/jwt");
const { authenticateJWT } = require("../middleware/auth");

const router = express.Router();

// Rota para iniciar autenticação com Google
router.get(
  "/google",
  passport.authenticate("google", { scope: ["openid", "profile", "email"] })
);

// Callback do Google OAuth
router.get(
  "/google/callback",
  passport.authenticate("google", { session: false }),
  (req, res) => {
    const user = req.user;
    console.log("User logged in:", user);
    const token = generateToken(user);
    console.log("JWT generated:", token);
    const redirectUrl = `${
      process.env.FRONTEND_URL || "http://localhost:5173"
    }/select-building?token=${encodeURIComponent(token)}`;
    console.log("Redirecting to:", redirectUrl);
    res.redirect(redirectUrl);
  }
);

// Obter informações do usuário autenticado
router.get("/user", authenticateJWT, (req, res) => {
  console.log("Request to /auth/user");
  console.log("Authenticated user:", req.user);
  res.json(req.user);
});

// Logout
router.get("/logout", (req, res) => {
  console.log("Logout requested");
  res.json({ success: true });
});

module.exports = router;