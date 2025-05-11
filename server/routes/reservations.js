const express = require("express");
const { authenticateJWT } = require("../middleware/auth");
const db = require("../db");

const router = express.Router();

// Obter reservas por prédio
router.get("/:building", authenticateJWT, (req, res) => {
  const { building } = req.params;
  console.log(`Fetching reservations for building: ${building}`);
  db.all(`SELECT * FROM reservations WHERE building = ?`, [building], (err, rows) => {
    if (err) {
      console.error("Error fetching reservations:", err);
      return res.status(500).json({ error: err.message });
    }
    console.log(`Reservations found for ${building}:`, rows.length);
    res.json(rows);
  });
});

// Criar uma nova reserva
router.post("/", authenticateJWT, (req, res) => {
  console.log("Receiving request for /reservations:", req.body);
  const { start, end, building, userId, ownerName } = req.body;
  const userName = req.user.name;

  if (!start || !end || !building || !userId || !userName || !ownerName) {
    console.log("Missing required fields:", { start, end, building, userId, userName, ownerName });
    return res.status(400).json({ error: "All fields are required, including ownerName." });
  }

  const startDate = new Date(start);
  const endDate = new Date(end);
  if (isNaN(startDate) || isNaN(endDate)) {
    console.log("Invalid dates:", { start, end });
    return res.status(400).json({ error: "Invalid dates." });
  }
  if (endDate <= startDate) {
    console.log("End time must be after start time:", { start, end });
    return res.status(400).json({ error: "End time must be after start time." });
  }

  db.all(
    `SELECT * FROM reservations WHERE building = ? AND (start < ? AND end > ?)`,
    [building, end, start],
    (err, rows) => {
      if (err) {
        console.error("Error checking reservations:", err);
        return res.status(500).json({ error: err.message });
      }
      console.log("Existing reservations checked:", rows);
      if (rows.length > 0) {
        console.log("Time slot conflict detected:", rows);
        return res.status(400).json({ error: "This time slot is already reserved." });
      }

      db.run(
        `INSERT INTO reservations (start, end, building, userId, userName, ownerName) VALUES (?, ?, ?, ?, ?, ?)`,
        [start, end, building, userId, userName, ownerName],
        function (err) {
          if (err) {
            console.error("Error creating reservation:", err);
            return res.status(500).json({ error: err.message });
          }
          console.log("Reservation created with ID:", this.lastID);
          db.run(
            `INSERT INTO history (action, eventId, eventDetails, userName, ownerName, timestamp) VALUES (?, ?, ?, ?, ?, ?)`,
            [
              "create",
              this.lastID,
              JSON.stringify({ start, end, building, ownerName }),
              userName,
              ownerName,
              new Date().toISOString(),
            ],
            (err) => {
              if (err) {
                console.error("Error logging history:", err);
              }
            }
          );
          res.json({ id: this.lastID });
        }
      );
    }
  );
});

// Atualizar uma reserva
router.put("/:id", authenticateJWT, (req, res) => {
  const { id } = req.params;
  const { start, end, building, userId, ownerName } = req.body;
  const userName = req.user.name;
  console.log("Receiving request for PUT /reservations/:id:", { id, start, end, building, userId, ownerName });

  if (!start || !end || !building || !userId || !ownerName) {
    console.log("Missing required fields:", { start, end, building, userId, ownerName });
    return res.status(400).json({ error: "All fields are required, including ownerName." });
  }

  const startDate = new Date(start);
  const endDate = new Date(end);
  if (isNaN(startDate) || isNaN(endDate)) {
    console.log("Invalid dates:", { start, end });
    return res.status(400).json({ error: "Invalid dates." });
  }
  if (endDate <= startDate) {
    console.log("End time must be after start time:", { start, end });
    return res.status(400).json({ error: "End time must be after start time." });
  }

  db.get(`SELECT userName, ownerName FROM reservations WHERE id = ?`, [id], (err, reservation) => {
    if (err) {
      console.error("Error fetching reservation:", err);
      return res.status(500).json({ error: err.message });
    }
    if (!reservation) {
      console.log(`Reservation ID ${id} not found`);
      return res.status(404).json({ error: "Reservation not found." });
    }

    db.all(
      `SELECT * FROM reservations WHERE building = ? AND id != ? AND (start < ? AND end > ?)`,
      [building, id, end, start],
      (err, rows) => {
        if (err) {
          console.error("Error checking reservations:", err);
          return res.status(500).json({ error: err.message });
        }
        console.log("Existing reservations checked:", rows);
        if (rows.length > 0) {
          console.log("Time slot conflict detected:", rows);
          return res.status(400).json({ error: "This time slot is already reserved." });
        }

        db.run(
          `UPDATE reservations SET start = ?, end = ?, building = ?, userId = ?, userName = ?, ownerName = ? WHERE id = ?`,
          [start, end, building, userId, userName, ownerName, id],
          function (err) {
            if (err) {
              console.error("Error updating reservation:", err);
              return res.status(500).json({ error: err.message });
            }
            if (this.changes === 0) {
              console.log(`Reservation ID ${id} not found`);
              return res.status(404).json({ error: "Reservation not found." });
            }
            console.log("Reservation updated with ID:", id);
            db.run(
              `INSERT INTO history (action, eventId, eventDetails, userName, ownerName, timestamp) VALUES (?, ?, ?, ?, ?, ?)`,
              [
                "update",
                id,
                JSON.stringify({ start, end, building, ownerName }),
                userName,
                ownerName,
                new Date().toISOString(),
              ],
              (err) => {
                if (err) {
                  console.error("Error logging history:", err);
                }
              }
            );
            res.json({ success: true });
          }
        );
      }
    );
  });
});

// Deletar uma reserva
router.delete("/:id", authenticateJWT, (req, res) => {
  const { id } = req.params;
  const { userName, building, start, end } = req.body;
  console.log("Receiving request for DELETE /reservations/:id:", { id, userName, building, start, end });

  db.get(`SELECT * FROM reservations WHERE id = ?`, [id], (err, reservation) => {
    if (err) {
      console.error("Error fetching reservation:", err);
      return res.status(500).json({ error: err.message });
    }
    if (!reservation) {
      console.log(`Reservation ID ${id} not found`);
      return res.status(404).json({ error: "Reservation not found." });
    }

    db.run(`DELETE FROM reservations WHERE id = ?`, [id], function (err) {
      if (err) {
        console.error("Error deleting reservation:", err);
        return res.status(500).json({ error: err.message });
      }
      if (this.changes === 0) {
        console.log(`Reservation ID ${id} not found`);
        return res.status(404).json({ error: "Reservation not found." });
      }
      console.log("Reservation deleted with ID:", id);
      db.run(
        `INSERT INTO history (action, eventId, eventDetails, userName, ownerName, timestamp) VALUES (?, ?, ?, ?, ?, ?)`,
        [
          "delete",
          id,
          JSON.stringify({ start: reservation.start, end: reservation.end, building: reservation.building, ownerName: reservation.ownerName }),
          userName,
          reservation.ownerName,
          new Date().toISOString(),
        ],
        (err) => {
          if (err) {
            console.error("Error logging history:", err);
          }
        }
      );
      res.json({ success: true });
    });
  });
});

module.exports = router;