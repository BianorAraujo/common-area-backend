const sqlite3 = require("sqlite3").verbose();
const db = new sqlite3.Database("./database.sqlite");

db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT,
      email TEXT
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS reservations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT,
      start DATETIME,
      end DATETIME,
      building TEXT,
      userId TEXT,
      userName TEXT
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