const express = require("express");
const cors = require("cors");
const session = require("express-session");
const passport = require("./auth");
const db = require("./db");

const app = express();

// Configurar CORS para aceitar requisições do frontend hospedado na Vercel
app.use(cors({ origin: "https://common-area.vercel.app", credentials: true }));
app.use(express.json());
app.use(
  session({
    secret: process.env.SESSION_SECRET || "seu_segredo",
    resave: false,
    saveUninitialized: false,
  })
);
app.use(passport.initialize());
app.use(passport.session());

app.get(
  "/auth/google",
  passport.authenticate("google", { scope: ["profile", "email"] })
);

app.get(
  "/auth/google/callback",
  passport.authenticate("google", { failureRedirect: "/" }),
  (req, res) => {
    res.redirect("https://common-area.vercel.app/dashboard");
  }
);

app.get("/auth/user", (req, res) => {
  if (req.user) {
    res.json(req.user);
  } else {
    res.status(401).json({ error: "Não autenticado" });
  }
});

app.get("/auth/logout", (req, res) => {
  req.logout(() => {
    res.status(200).json({ success: true });
  });
});

app.get("/reservations/:building", (req, res) => {
  const { building } = req.params;
  db.all(
    `SELECT * FROM reservations WHERE building = ?`,
    [building],
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows);
    }
  );
});

app.post("/reservations", (req, res) => {
  const { title, start, end, building, userId, userName } = req.body;

  // Verificar sobreposição
  db.all(
    `SELECT * FROM reservations WHERE building = ? AND (
      (start <= ? AND end >= ?) OR 
      (start <= ? AND end >= ?) OR 
      (start >= ? AND end <= ?)
    )`,
    [building, start, start, end, end, start, end],
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      if (rows.length > 0) {
        return res.status(400).json({ error: "Horário já reservado para este prédio." });
      }

      // Se não houver sobreposição, criar a reserva
      db.run(
        `INSERT INTO reservations (title, start, end, building, userId, userName) VALUES (?, ?, ?, ?, ?, ?)`,
        [title, start, end, building, userId, userName],
        function (err) {
          if (err) return res.status(500).json({ error: err.message });
          db.run(
            `INSERT INTO history (action, eventId, eventDetails, userName, timestamp) VALUES (?, ?, ?, ?, ?)`,
            [
              "create",
              this.lastID,
              JSON.stringify({ title, start, end, building }),
              userName,
              new Date().toISOString(),
            ]
          );
          res.json({ id: this.lastID });
        }
      );
    }
  );
});

app.put("/reservations/:id", (req, res) => {
  const { id } = req.params;
  const { start, end, userName } = req.body;
  db.run(
    `UPDATE reservations SET start = ?, end = ? WHERE id = ?`,
    [start, end, id],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      db.run(
        `INSERT INTO history (action, eventId, eventDetails, userName, timestamp) VALUES (?, ?, ?, ?, ?)`,
        [
          "update",
          id,
          JSON.stringify({ start, end }),
          userName,
          new Date().toISOString(),
        ]
      );
      res.json({ success: true });
    }
  );
});

app.delete("/reservations/:id", (req, res) => {
  const { id } = req.params;
  const { userName } = req.body;
  db.run(`DELETE FROM reservations WHERE id = ?`, [id], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    db.run(
      `INSERT INTO history (action, eventId, eventDetails, userName, timestamp) VALUES (?, ?, ?, ?, ?)`,
      ["delete", id, "{}", userName, new Date().toISOString()]
    );
    res.json({ success: true });
  });
});

app.get("/history", (req, res) => {
  db.all(`SELECT * FROM history ORDER BY timestamp DESC`, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});