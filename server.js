require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const { v4: uuidv4 } = require('uuid');

const app = express();

// 1. Configurazioni base
app.use(cors({ origin: '*' })); // Permette a chiunque (Vite, BTP) di chiamare le API
app.use(express.json()); // Permette di leggere i JSON in arrivo

// 2. Connessione al Database Railway
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// 3. Inizializzazione Tabelle (Robusta)
const initDB = async () => {
  try {
    await pool.query('DROP TABLE IF EXISTS orders;');

    await pool.query(`
      CREATE TABLE IF NOT EXISTS orders (
        id UUID PRIMARY KEY,
        sap_order_number VARCHAR(50) UNIQUE,
        bp_name VARCHAR(100),
        total_amount DECIMAL(10,2),
        currency VARCHAR(10),
        items JSONB,
        status VARCHAR(50),
        received_from_sap_at TIMESTAMP
      );
    `);
    console.log('✅ Tabella "orders" verificata/creata con successo');
  } catch (err) {
    console.error('❌ Errore creazione tabelle:', err.message);
  }
};
initDB();

// ==========================================
// 🚀 ENDPOINT API
// ==========================================

// [GET] Leggi tutti gli ordini per la Dashboard React
app.get('/api/orders', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM orders ORDER BY received_from_sap_at DESC NULLS LAST');
    res.json(result.rows);
  } catch (err) {
    console.error('❌ Errore GET /api/orders:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// [POST] IF1 - Ricevi nuovo ordine da SAP S/4HANA (via BTP)
app.post('/api/if1/receive-order', async (req, res) => {
  try {
    console.log("📥 Payload ricevuto da SAP:", req.body);
    const { numero_ordine, cliente, prodotto, quantita, prezzo_unitario } = req.body;

    if (!numero_ordine) return res.status(400).json({ error: "numero_ordine mancante" });

    const orderId = uuidv4();
    const totalAmount = quantita * prezzo_unitario;
    const items = [{ prodotto, quantita, prezzo_unitario }];

    await pool.query(`
      INSERT INTO orders (id, sap_order_number, bp_name, total_amount, currency, items, status, received_from_sap_at)
      VALUES ($1, $2, $3, $4, 'EUR', $5, 'RICEVUTO_DA_SAP', CURRENT_TIMESTAMP)
    `, [orderId, numero_ordine, cliente, totalAmount, JSON.stringify(items)]);

    console.log(`✅ Ordine SAP ${numero_ordine} salvato nel DB!`);
    res.status(200).json({ success: true, message: "Ordine salvato nel TMS" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// [PUT] Conferma Ordine da Dashboard (Preparazione per invio a SAP)
app.put('/api/orders/:id/confirm', async (req, res) => {
  try {
    const orderId = req.params.id;
    await pool.query("UPDATE orders SET status = 'CONFERMATO_DA_TMS' WHERE id = $1", [orderId]);
    console.log(`✅ Ordine ${orderId} confermato dall'utente`);
    res.json({ success: true, message: "Ordine confermato" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}); // <-- Ti mancavano queste parentesi!

// 4. Avvio Server (E ti mancava questo pezzo!)
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`🚀 TMS Backend in ascolto sulla porta ${PORT}`);
});   