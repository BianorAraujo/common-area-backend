const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const sqlite3 = require("sqlite3").verbose();
require("dotenv").config();

const app = express();
app.use(cors({ origin: process.env.FRONTEND_URL }));
app.use(express.json());

const db = new sqlite3.Database("./database.db", (err) => {
  if (err) console.error("Erro ao conectar ao banco de dados:", err);
  else console.log("Conectado ao banco de dados SQLite");
});

const authenticateJWT = (req, res, next) => {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.status(401).json({ error: "Token não fornecido" });

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: "Token inválido" });
    req.user = user;
    next();
  });
};

app.post("/login", (req, res) => {
  const { email, password } = req.body;
  console.log("Tentativa de login:", { email });

  db.get(`SELECT * FROM users WHERE email = ?`, [email], (err, user) => {
    if (err) {
      console.error("Erro ao buscar usuário:", err);
      return res.status(500).json({ error: err.message });
    }
    if (!user) {
      console.log("Usuário não encontrado:", email);
      return res.status(401).json({ error: "Credenciais inválidas" });
    }

    bcrypt.compare(password, user.password, (err, result) => {
      if (err) {
        console.error("Erro ao comparar senhas:", err);
        return res.status(500).json({ error: err.message });
      }
      if (!result) {
        console.log("Senha incorreta para:", email);
        return res.status(401).json({ error: "Credenciais inválidas" });
      }

      const token = jwt.sign({ id: user.id, email: user.email, name: user.name }, process.env.JWT_SECRET, {
        expiresIn: "1h",
      });
      console.log("Login bem-sucedido:", { email, token: "..." });
      res.json({ token });
    });
  });
});

app.get("/auth/user", authenticateJWT, (req, res) => {
  db.get(`SELECT id, name, email FROM users WHERE id = ?`, [req.user.id], (err, user) => {
    if (err) {
      console.error("Erro ao buscar usuário autenticado:", err);
      return res.status(500).json({ error: err.message });
    }
    if (!user) {
      console.log("Usuário autenticado não encontrado:", req.user.id);
      return res.status(404).json({ error: "Usuário não encontrado" });
    }
    console.log("Usuário autenticado retornado:", user);
    res.json(user);
  });
});

app.get("/buildings", authenticateJWT, (req, res) => {
  db.all(`SELECT name FROM buildings`, [], (err, rows) => {
    if (err) {
      console.error("Erro ao buscar prédios:", err);
      return res.status(500).json({ error: err.message });
    }
    console.log("Prédios retornados:", rows);
    res.json(rows);
  });
});

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
  const { start, end, building, userId, userName } = req.body;
  console.log("Recebendo requisição para /reservations:", { start, end, building, userId, userName });

  if (!start || !end || !building || !userId || !userName) {
    console.log("Dados incompletos para reserva:", req.body);
    return res.status(400).json({ error: "Todos os campos são obrigatórios" });
  }

  const startDate = new Date(start);
  const endDate = new Date(end);
  if (isNaN(startDate) || isNaN(endDate)) {
    console.log("Datas inválidas:", { start, end });
    return res.status(400).json({ error: "Datas inválidas" });
  }
  if (endDate <= startDate) {
    console.log("Horário final deve ser após o inicial:", { start, end });
    return res.status(400).json({ error: "O horário final deve ser após o inicial" });
  }

  db.all(
    `SELECT * FROM reservations WHERE building = ? AND (
      (start <= ? AND end >= ?) OR
      (start <= ? AND end >= ?) OR
      (start >= ? AND end <= ?)
    )`,
    [building, end, start, start, start, start, end],
    (err, conflictingReservations) => {
      if (err) {
        console.error("Erro ao verificar conflitos:", err);
        return res.status(500).json({ error: err.message });
      }
      if (conflictingReservations.length > 0) {
        console.log("Conflito de reserva encontrado:", conflictingReservations);
        return res.status(409).json({ error: "Conflito com outra reserva" });
      }

      db.run(
        `INSERT INTO reservations (start, end, building, userId, userName) VALUES (?, ?, ?, ?, ?)`,
        [start, end, building, userId, userName],
        function (err) {
          if (err) {
            console.error("Erro ao criar reserva:", err);
            return res.status(500).json({ error: err.message });
          }
          console.log(`Reserva criada com ID: ${this.lastID}`);

          db.run(
            `INSERT INTO history (reservationId, userId, action, details) VALUES (?, ?, ?, ?)`,
            [
              this.lastID,
              userId,
              "create",
              JSON.stringify({ building, start, end, userName, action: "created" }),
            ],
            (err) => {
              if (err) {
                console.error("Erro ao registrar no histórico:", err);
                return res.status(500).json({ error: err.message });
              }
              console.log(`Histórico registrado para reserva ID: ${this.lastID}`);
              res.status(201).json({ id: this.lastID });
            }
          );
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
    console.log("Dados incompletos para edição:", req.body);
    return res.status(400).json({ error: "Todos os campos são obrigatórios" });
  }

  const startDate = new Date(start);
  const endDate = new Date(end);
  if (isNaN(startDate) || isNaN(endDate)) {
    console.log("Datas inválidas:", { start, end });
    return res.status(400).json({ error: "Datas inválidas" });
  }
  if (endDate <= startDate) {
    console.log("Horário final deve ser após o inicial:", { start, end });
    return res.status(400).json({ error: "O horário final deve ser após o inicial" });
  }

  // Verificar conflitos, excluindo a própria reserva
  db.all(
    `SELECT * FROM reservations WHERE building = ? AND id != ? AND (
      (start <= ? AND end >= ?) OR
      (start <= ? AND end >= ?) OR
      (start >= ? AND end <= ?)
    )`,
    [building, id, end, start, start, start, start, end],
    (err, conflictingReservations) => {
      if (err) {
        console.error("Erro ao verificar conflitos:", err);
        return res.status(500).json({ error: err.message });
      }
      if (conflictingReservations.length > 0) {
        console.log("Conflito de reserva encontrado:", conflictingReservations);
        return res.status(409).json({ error: "Conflito com outra reserva" });
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
            return res.status(404).json({ error: "Reserva não encontrada" });
          }
          console.log(`Reserva ID ${id} atualizada`);

          db.run(
            `INSERT INTO history (reservationId, userId, action, details) VALUES (?, ?, ?, ?)`,
            [
              id,
              userId,
              "update",
              JSON.stringify({ building, start, end, userName, action: "updated" }),
            ],
            (err) => {
              if (err) {
                console.error("Erro ao registrar no histórico:", err);
                return res.status(500).json({ error: err.message });
              }
              console.log(`Histórico registrado para atualização da reserva ID: ${id}`);
              res.json({ message: "Reserva atualizada" });
            }
          );
        }
      );
    }
  );
});

app.delete("/reservations/:id", authenticateJWT, (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;
  console.log(`Recebendo requisição para DELETE /reservations/${id}`);

  db.get(`SELECT * FROM reservations WHERE id = ?`, [id], (err, reservation) => {
    if (err) {
      console.error("Erro ao buscar reserva:", err);
      return res.status(500).json({ error: err.message });
    }
    if (!reservation) {
      console.log(`Reserva ID ${id} não encontrada`);
      return res.status(404).json({ error: "Reserva não encontrada" });
    }

    db.run(`DELETE FROM reservations WHERE id = ?`, [id], function (err) {
      if (err) {
        console.error("Erro ao excluir reserva:", err);
        return res.status(500).json({ error: err.message });
      }
      if (this.changes === 0) {
        console.log(`Reserva ID ${id} não encontrada`);
        return res.status(404).json({ error: "Reserva não encontrada" });
      }
      console.log(`Reserva ID ${id} excluída`);

      db.run(
        `INSERT INTO history (reservationId, userId, action, details) VALUES (?, ?, ?, ?)`,
        [
          id,
          userId,
          "delete",
          JSON.stringify({
            building: reservation.building,
            start: reservation.start,
            end: reservation.end,
            userName: reservation.userName,
            action: "deleted",
          }),
        ],
        (err) => {
          if (err) {
            console.error("Erro ao registrar no histórico:", err);
            return res.status(500).json({ error: err.message });
          }
          console.log(`Histórico registrado para exclusão da reserva ID: ${id}`);
          res.json({ message: "Reserva excluída" });
        }
      );
    });
  });
});

app.get("/history", authenticateJWT, (req, res) => {
  const userId = req.user.id;
  console.log(`Buscando histórico para usuário: ${userId}`);

  db.all(
    `SELECT h.*, json_extract(h.details, '$.building') as building
     FROM history h
     WHERE json_extract(h.details, '$.userId') = ?
     ORDER BY h.createdAt DESC`,
    [userId],
    (err, rows) => {
      if (err) {
        console.error("Erro ao buscar histórico:", err);
        return res.status(500).json({ error: err.message });
      }
      console.log(`Histórico retornado para usuário ${userId}:`, rows.length);
      res.json(rows);
    }
  );
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});