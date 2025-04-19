require("dotenv").config();
const express = require("express");
const cors = require("cors");
const passport = require("passport");
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const jwt = require("jsonwebtoken");
const sqlite3 = require("sqlite3").verbose();

const app = express();

// Configurar banco de dados SQLite
const db = new sqlite3.Database("./reservations.db", (err) => {
  if (err) {
    console.error("Erro ao conectar ao banco de dados:", err);
  } else {
    console.log("Conectado ao banco de dados SQLite");
  }
});

// Criar tabelas
db.serialize(() => {
  db.run(
    `CREATE TABLE IF NOT EXISTS reservations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT,
      start TEXT,
      end TEXT,
      building TEXT,
      userId TEXT,
      userName TEXT
    )`
  );
  db.run(
    `CREATE TABLE IF NOT EXISTS history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      action TEXT,
      eventId INTEGER,
      eventDetails TEXT,
      userName TEXT,
      timestamp TEXT
    )`
  );
});

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

// Configurar Passport para Google OAuth
passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: `${
        process.env.BACKEND_URL || "http://localhost:3000"
      }/auth/google/callback`,
    },
    (accessToken, refreshToken, profile, done) => {
      const user = {
        id: profile.id,
        name: profile.displayName,
        email: profile.emails[0].value,
      };
      return done(null, user);
    }
  )
);

passport.serializeUser((user, done) => {
  done(null, user);
});
passport.deserializeUser((user, done) => {
  done(null, user);
});

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
    return res.status(401).json({ error: "Não autenticado" });
  }

  const token = authHeader.split(" ")[1];
  jwt.verify(token, process.env.JWT_SECRET || "seu_jwt_segredo", (err, user) => {
    if (err) {
      console.log("Erro ao verificar JWT:", err.message);
      return res.status(403).json({ error: "Token inválido" });
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
    // Redirecionar para o frontend com o token como parâmetro de query
    const redirectUrl = `${
      process.env.FRONTEND_URL || "http://localhost:5173"
    }/dashboard?token=${encodeURIComponent(token)}`;
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
  db.all(`SELECT * FROM reservations WHERE building = ?`, [building], (err, rows) => {
    if (err) {
      console.error("Erro ao buscar reservas:", err);
      return res.status(500).json({ error: err.message });
    }
    res.json(rows);
  });
});

app.post("/reservations", authenticateJWT, (req, res) => {
    console.log("Recebendo requisição para /reservations:", req.body);
    const { title, start, end, building, userId, userName } = req.body;
  
    if (!title || !start || !end || !building || !userId || !userName) {
      console.log("Campos obrigatórios ausentes:", { title, start, end, building, userId, userName });
      return res.status(400).json({ error: "Todos os campos são obrigatórios." });
    }
  
    db.all(
      `SELECT * FROM reservations WHERE building = ? AND (
        (start <= ? AND end >= ?) OR 
        (start <= ? AND end >= ?) OR 
        (start >= ? AND end <= ?)
      )`,
      [building, start, start, end, end, start, end],
      (err, rows) => {
        if (err) {
          console.error("Erro ao verificar reservas:", err);
          return res.status(500).json({ error: err.message });
        }
        console.log("Reservas existentes:", rows);
        if (rows.length > 0) {
          console.log("Conflito de horário detectado:", rows);
          return res.status(400).json({ error: "Horário já reservado para este prédio." });
        }
  
        db.run(
          `INSERT INTO reservations (title, start, end, building, userId, userName) VALUES (?, ?, ?, ?, ?, ?)`,
          [title, start, end, building, userId, userName],
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
                JSON.stringify({ title, start, end, building }),
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
  const { start, end, userName } = req.body;
  db.run(
    `UPDATE reservations SET start = ?, end = ? WHERE id = ?`,
    [start, end, id],
    function (err) {
      if (err) {
        console.error("Erro ao atualizar reserva:", err);
        return res.status(500).json({ error: err.message });
      }
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

app.delete("/reservations/:id", authenticateJWT, (req, res) => {
  const { id } = req.params;
  const { userName } = req.body;
  db.run(`DELETE FROM reservations WHERE id = ?`, [id], function (err) {
    if (err) {
      console.error("Erro ao deletar reserva:", err);
      return res.status(500).json({ error: err.message });
    }
    db.run(
      `INSERT INTO history (action, eventId, eventDetails, userName, timestamp) VALUES (?, ?, ?, ?, ?)`,
      ["delete", id, "{}", userName, new Date().toISOString()]
    );
    res.json({ success: true });
  });
});

app.get("/history", authenticateJWT, (req, res) => {
  db.all(`SELECT * FROM history ORDER BY timestamp DESC`, (err, rows) => {
    if (err) {
      console.error("Erro ao buscar histórico:", err);
      return res.status(500).json({ error: err.message });
    }
    res.json(rows);
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});