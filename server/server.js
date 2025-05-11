require("dotenv").config();
const express = require("express");
const cors = require("cors");
const passport = require("./auth");
const authRoutes = require("./routes/auth");
const reservationRoutes = require("./routes/reservations");
const historyRoutes = require("./routes/history");

const app = express();

// Configurar middleware
app.use(
  cors({
    origin: process.env.FRONTEND_URL || "http://localhost:5173",
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);
app.use(express.json());
app.use(passport.initialize());

// Montar rotas
app.use("/auth", authRoutes);
app.use("/reservations", reservationRoutes);
app.use("/history", historyRoutes);

// Rota raiz
app.get("/", (req, res) => {
  return res.status(200).json("Backend running!");
});

// Iniciar servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});