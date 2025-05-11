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
      userName TEXT NOT NULL,
      ownerName TEXT NOT NULL
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      action TEXT,
      eventId INTEGER,
      eventDetails TEXT,
      ownerName TEXT,
      userName TEXT,
      timestamp DATETIME
    )
  `);

  // Adicionar ownerName a bancos existentes
  db.run(`ALTER TABLE reservations ADD COLUMN ownerName TEXT`, (err) => {
    if (err && !err.message.includes("duplicate column")) {
      console.error("Erro ao adicionar ownerName à tabela reservations:", err);
    } else {
      console.log("Coluna ownerName adicionada ou já existe na tabela reservations");
      // Preencher ownerName com userName para registros existentes
      db.run(
        `UPDATE reservations SET ownerName = userName WHERE ownerName IS NULL`,
        (err) => {
          if (err) {
            console.error("Erro ao preencher ownerName com userName:", err);
          } else {
            console.log("ownerName preenchido com userName para registros existentes");
          }
        }
      );
    }
  });
});

module.exports = db;