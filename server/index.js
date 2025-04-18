require("dotenv").config();
const express = require("express");
const cors = require("cors");
const session = require("express-session");
//const Sequelize = require("sequelize");
//const SequelizeStore = require("connect-session-sequelize")(session.Store);
const passport = require("./auth");
const db = require("./db");

const app = express();

//// Configurar Sequelize para SQLite
// const sequelize = new Sequelize("sqlite://session.db", {
//   logging: false,
// });

//// Configurar armazenamento de sessões com Sequelize
// const sessionStore = new SequelizeStore({
//   db: sequelize,
// });
// sessionStore.sync().then(() => {
//   console.log("SequelizeStore sincronizado com sucesso");
// }).catch(err => {
//   console.error("Erro ao sincronizar SequelizeStore:", err);
// });

app.use(
  cors({
    origin: process.env.FRONTEND_URL,
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization", "Cookie"],
  })
);
app.use(express.json());
app.use(
  session({
    secret: process.env.SESSION_SECRET || "seu_segredo",
    resave: false,
    saveUninitialized: false,
    store: new session.MemoryStore(), // Usar MemoryStore para teste
    cookie: {
      secure: process.env.NODE_ENV === "production" ? true : false,
      sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
      httpOnly: true,
      maxAge: 24 * 60 * 60 * 1000, // 24 horas
      path: "/",
    },
  })
);
app.use(passport.initialize());
app.use(passport.session());

// Log para depurar todas as requisições recebidas
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url} - Session ID: ${req.sessionID}`);
  console.log("Raw Cookie Header:", req.headers.cookie || "Nenhum cookie enviado");
  next();
});

app.get(
  "/auth/google",
  passport.authenticate("google", { scope: ["openid", "profile", "email"] })
);

app.get(
  "/auth/google/callback",
  (req, res, next) => {
    passport.authenticate("google", (err, user, info) => {
      if (err) {
        console.error("Erro no callback do Google:", err);
        return res.status(400).json({ error: err.message });
      }
      if (!user) {
        console.log("Nenhum usuário retornado pelo Google", info);
        return res.redirect("/");
      }
      req.logIn(user, (err) => {
        if (err) {
          console.error("Erro ao fazer login:", err);
          return res.status(400).json({ error: err.message });
        }
        console.log("Usuário logado:", user);
        console.log("Sessão após login:", req.session);
        console.log("Cookie enviado:", req.session.cookie);
        console.log("Session ID definido:", req.sessionID);
        //res.setHeader("Set-Cookie", `connect.sid=${req.sessionID}; Secure; HttpOnly; SameSite=None; Path=/`);
        return res.redirect(`${process.env.FRONTEND_URL}/dashboard`);
      });
    })(req, res, next);
  }
);

app.get("/auth/user", (req, res) => {
  console.log("Requisição para /auth/user");
  console.log("Session ID:", req.sessionID);
  console.log("Sessão:", req.session);
  console.log("Cookies:", req.cookies);
  console.log("Raw Cookie Header:", req.headers.cookie || "Nenhum cookie enviado");
  console.log("Headers:", req.headers);
  console.log("Usuário na sessão:", req.user);
  if (req.user) {
    res.json(req.user);
  } else {
    console.log("Usuário não autenticado, retornando 401");
    res.status(401).json({ error: "Não autenticado" });
  }
});

app.get("/auth/logout", (req, res) => {
  req.logout(() => {
    console.log("Logout realizado");
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