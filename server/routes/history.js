const express = require("express");
const { authenticateJWT } = require("../middleware/auth");
const db = require("../db");

const router = express.Router();

// Obter histórico
router.get("/", authenticateJWT, (req, res) => {
  const building = req.query.building;
  console.log(`Fetching history${building ? ` for building: ${building}` : ""}`);
  const query = building
    ? `SELECT * FROM history WHERE json_extract(eventDetails, '$.building') = ? ORDER BY timestamp DESC`
    : `SELECT * FROM history ORDER BY timestamp DESC`;
  const params = building ? [building] : [];
  db.all(query, params, (err, rows) => {
    if (err) {
      console.error("Error fetching history:", err);
      return res.status(500).json({ error: err.message });
    }
    console.log("History returned:", rows);
    res.json(rows);
  });
});

module.exports = router;