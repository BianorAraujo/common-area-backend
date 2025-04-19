const sqlite3 = require("sqlite3").verbose();

// Configurar banco de dados SQLite
const db = new sqlite3.Database("./database.db", (err) => {
  if (err) {
    console.error("Erro ao conectar ao banco de dados:", err);
  } else {
    console.log("Conectado ao banco de dados SQLite");
  }
});

db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS reservations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      start TEXT NOT NULL,
      end TEXT NOT NULL,
      building TEXT NOT NULL,
      userId TEXT NOT NULL,
      userName TEXT NOT NULL
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      action TEXT,
      eventId INTEGER,
      eventDetails TEXT,
      userName TEXT,
      timestamp DATETIME
    )
  `);
});

module.exports = db;