require("dotenv").config();
const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const passport = require("./auth");
const db = require("./db");

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

// Função para gerar JWT
const generateToken = (user) => {
  return jwt.sign(
    { id: user.id, name: user.name, email: user.email },
    process.env.JWT_SECRET || "seu_jwt_segredo",
    { expiresIn: "24h" }
  );
};

// Middleware para verificar JWT
const authenticateJWT = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    console.log("Nenhum token JWT fornecido");
    return res.status(401).json({ error: "Not authenticated" });
  }

  const token = authHeader.split(" ")[1];
  jwt.verify(token, process.env.JWT_SECRET || "seu_jwt_segredo", (err, user) => {
    if (err) {
      console.log("Erro ao verificar JWT:", err.message);
      return res.status(403).json({ error: "Invalid token" });
    }
    req.user = user;
    next();
  });
};

// Rotas de autenticação
app.get(
  "/auth/google",
  passport.authenticate("google", { scope: ["openid", "profile", "email"] })
);

app.get(
  "/auth/google/callback",
  passport.authenticate("google", { session: false }),
  (req, res) => {
    const user = req.user;
    console.log("Usuário logado:", user);
    const token = generateToken(user);
    console.log("JWT gerado:", token);
    const redirectUrl = `${
      process.env.FRONTEND_URL || "http://localhost:5173"
    }/select-building?token=${encodeURIComponent(token)}`;
    console.log("Redirecionando para:", redirectUrl);
    res.redirect(redirectUrl);
  }
);

app.get("/auth/user", authenticateJWT, (req, res) => {
  console.log("Requisição para /auth/user");
  console.log("Usuário autenticado:", req.user);
  res.json(req.user);
});

app.get("/auth/logout", (req, res) => {
  console.log("Logout solicitado");
  res.json({ success: true });
});

// Rotas de reservas
app.get("/reservations/:building", authenticateJWT, (req, res) => {
  const { building } = req.params;
  console.log(`Buscando reservas para o prédio: ${building}`);
  db.all(`SELECT * FROM reservations WHERE building = ?`, [building], (err, rows) => {
    if (err) {
      console.error("Erro ao buscar reservas:", err);
      return res.status(500).json({ error: err.message });
    }
    console.log(`Reservas encontradas para ${building}:`, rows.length);
    res.json(rows);
  });
});

app.post("/reservations", authenticateJWT, (req, res) => {
  console.log("Recebendo requisição para /reservations:", req.body);
  const { start, end, building, userId, userName } = req.body;

  if (!start || !end || !building || !userId || !userName) {
    console.log("Campos obrigatórios ausentes:", { start, end, building, userId, userName });
    return res.status(400).json({ error: "All fields are required." });
  }

  const startDate = new Date(start);
  const endDate = new Date(end);
  if (isNaN(startDate) || isNaN(endDate)) {
    console.log("Datas inválidas:", { start, end });
    return res.status(400).json({ error: "Invalid dates." });
  }
  if (endDate <= startDate) {
    console.log("Horário final deve ser após o inicial:", { start, end });
    return res.status(400).json({ error: "End time must be after start time." });
  }

  db.all(
    `SELECT * FROM reservations WHERE building = ? AND (start < ? AND end > ?)`,
    [building, end, start],
    (err, rows) => {
      if (err) {
        console.error("Erro ao verificar reservas:", err);
        return res.status(500).json({ error: err.message });
      }
      console.log("Reservas existentes verificadas:", rows);
      if (rows.length > 0) {
        console.log("Conflito de horário detectado:", rows);
        return res.status(400).json({ error: "This time slot is already reserved." });
      }

      db.run(
        `INSERT INTO reservations (start, end, building, userId, userName) VALUES (?, ?, ?, ?, ?)`,
        [start, end, building, userId, userName],
        function (err) {
          if (err) {
            console.error("Erro ao criar reserva:", err);
            return res.status(500).json({ error: err.message });
          }
          console.log("Reserva criada com ID:", this.lastID);
          db.run(
            `INSERT INTO history (action, eventId, eventDetails, userName, timestamp) VALUES (?, ?, ?, ?, ?)`,
            [
              "create",
              this.lastID,
              JSON.stringify({ start, end, building }),
              userName,
              new Date().toISOString(),
            ],
            (err) => {
              if (err) {
                console.error("Erro ao registrar histórico:", err);
              }
            }
          );
          res.json({ id: this.lastID });
        }
      );
    }
  );
});

app.put("/reservations/:id", authenticateJWT, (req, res) => {
  const { id } = req.params;
  const { start, end, building, userId, userName } = req.body;
  console.log("Recebendo requisição para PUT /reservations/:id:", { id, start, end, building, userId, userName });

  if (!start || !end || !building || !userId || !userName) {
    console.log("Campos obrigatórios ausentes:", { start, end, building, userId, userName });
    return res.status(400).json({ error: "All fields are required." });
  }

  const startDate = new Date(start);
  const endDate = new Date(end);
  if (isNaN(startDate) || isNaN(endDate)) {
    console.log("Datas inválidas:", { start, end });
    return res.status(400).json({ error: "Invalid dates." });
  }
  if (endDate <= startDate) {
    console.log("Horário final deve ser após o inicial:", { start, end });
    return res.status(400).json({ error: "End time must be after start time." });
  }

  // Verificar conflitos, excluindo a própria reserva
  db.all(
    `SELECT * FROM reservations WHERE building = ? AND id != ? AND (start < ? AND end > ?)`,
    [building, id, end, start],
    (err, rows) => {
      if (err) {
        console.error("Erro ao verificar reservas:", err);
        return res.status(500).json({ error: err.message });
      }
      console.log("Reservas existentes verificadas:", rows);
      if (rows.length > 0) {
        console.log("Conflito de horário detectado:", rows);
        return res.status(400).json({ error: "This time slot is already reserved." });
      }

      db.run(
        `UPDATE reservations SET start = ?, end = ?, building = ?, userId = ?, userName = ? WHERE id = ?`,
        [start, end, building, userId, userName, id],
        function (err) {
          if (err) {
            console.error("Erro ao atualizar reserva:", err);
            return res.status(500).json({ error: err.message });
          }
          if (this.changes === 0) {
            console.log(`Reserva ID ${id} não encontrada`);
            return res.status(404).json({ error: "Reservation not found." });
          }
          console.log("Reserva atualizada com ID:", id);
          db.run(
            `INSERT INTO history (action, eventId, eventDetails, userName, timestamp) VALUES (?, ?, ?, ?, ?)`,
            [
              "update",
              id,
              JSON.stringify({ start, end, building }),
              userName,
              new Date().toISOString(),
            ],
            (err) => {
              if (err) {
                console.error("Erro ao registrar histórico:", err);
              }
            }
          );
          res.json({ success: true });
        }
      );
    }
  );
});

app.delete("/reservations/:id", authenticateJWT, (req, res) => {
  const { id } = req.params;
  const { userName, building, start, end } = req.body;
  console.log("Recebendo requisição para DELETE /reservations/:id:", { id, userName, building, start, end });

  db.get(`SELECT * FROM reservations WHERE id = ?`, [id], (err, reservation) => {
    if (err) {
      console.error("Erro ao buscar reserva:", err);
      return res.status(500).json({ error: err.message });
    }
    if (!reservation) {
      console.log(`Reserva ID ${id} não encontrada`);
      return res.status(404).json({ error: "Reservation not found." });
    }

    db.run(`DELETE FROM reservations WHERE id = ?`, [id], function (err) {
      if (err) {
        console.error("Erro ao deletar reserva:", err);
        return res.status(500).json({ error: err.message });
      }
      if (this.changes === 0) {
        console.log(`Reserva ID ${id} não encontrada`);
        return res.status(404).json({ error: "Reservation not found." });
      }
      console.log("Reserva deletada com ID:", id);
      db.run(
        `INSERT INTO history (action, eventId, eventDetails, userName, timestamp) VALUES (?, ?, ?, ?, ?)`,
        [
          "delete",
          id,
          JSON.stringify({ start: reservation.start, end: reservation.end, building: reservation.building }),
          userName,
          new Date().toISOString(),
        ],
        (err) => {
          if (err) {
            console.error("Erro ao registrar histórico:", err);
          }
        }
      );
      res.json({ success: true });
    });
  });
});

app.get("/history", authenticateJWT, (req, res) => {
  const building = req.query.building;
  console.log(`Fetching history${building ? ` for building: ${building}` : ""}`);
  const query = building
    ? `SELECT * FROM history WHERE json_extract(eventDetails, '$.building') = ? ORDER BY timestamp DESC`
    : `SELECT * FROM history ORDER BY timestamp DESC`;
  const params = building ? [building] : [];
  db.all(query, params, (err, rows) => {
    if (err) {
      console.error("Erro ao buscar histórico:", err);
      return res.status(500).json({ error: err.message });
    }
    console.log("Histórico retornado:", rows);
    res.json(rows);
  });
});

app.get("/", (req, res) => {
  return res.status(200).json("Backend running!");
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});