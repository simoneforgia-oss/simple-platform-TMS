require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const { v4: uuidv4 } = require('uuid');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
//app.use(cors({ origin: '*' }));
/*app.use(cors({
  origin: ['http://localhost:3000', 'http://localhost:5173', 'https://logistics-tms-frontend.vercel.app'],
  credentials: true
}));*/
app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// PostgreSQL Pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }, // <-- Cambia questa riga così!
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// Test connessione DB
pool.connect((err, client, release) => {
  if (err) {
    console.error('❌ Errore connessione PostgreSQL:', err.stack);
  } else {
    console.log('✅ PostgreSQL connesso con successo');
    release();
  }
});

//TABLE CREATION
const initDB = async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS orders (
        id UUID PRIMARY KEY,
        order_type VARCHAR(50),
        sap_order_number VARCHAR(50) UNIQUE,
        sap_document_date DATE,
        customer_number VARCHAR(50),
        vendor_number VARCHAR(50),
        bp_name VARCHAR(100),
        total_amount DECIMAL(10,2),
        currency VARCHAR(10),
        payment_terms VARCHAR(50),
        delivery_date DATE,
        plant VARCHAR(50),
        shipping_point VARCHAR(50),
        items JSONB,
        status VARCHAR(50),
        received_from_sap_at TIMESTAMP,
        updated_at TIMESTAMP,
        transport_id UUID,
        delivery_number VARCHAR(50),
        preinvoice_id UUID,
        confirmed_at TIMESTAMP,
        confirmed_by VARCHAR(50)
      );

      CREATE TABLE IF NOT EXISTS transports (
        id UUID PRIMARY KEY,
        sap_transport_number VARCHAR(50) UNIQUE,
        transport_date DATE,
        carrier VARCHAR(100),
        vehicle_plate VARCHAR(50),
        driver_name VARCHAR(100),
        driver_phone VARCHAR(50),
        status VARCHAR(50),
        updated_at TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS preinvoices (
        id UUID PRIMARY KEY,
        invoice_number VARCHAR(50) UNIQUE,
        order_id UUID,
        billing_date DATE,
        total_amount DECIMAL(10,2),
        currency VARCHAR(10),
        vat_amount DECIMAL(10,2),
        net_amount DECIMAL(10,2),
        payment_terms VARCHAR(50),
        due_date DATE,
        status VARCHAR(50),
        items JSONB,
        sent_to_sap_at TIMESTAMP,
        sap_invoice_number VARCHAR(50)
      );

      CREATE TABLE IF NOT EXISTS order_confirmations (
        id UUID PRIMARY KEY,
        order_id UUID,
        confirmation_date TIMESTAMP,
        confirmed_items JSONB,
        notes TEXT,
        confirmed_by VARCHAR(50),
        sent_to_sap_at TIMESTAMP,
        sap_confirmation_number VARCHAR(50)
      );
    `);
    console.log('✅ Tabelle del database verificate/create con successo');
  } catch (err) {
    console.error('❌ Errore creazione tabelle:', err.message);
  }
};

initDB(); // Lanciamo la funzione all'avvio

// ========================================
// UTILITY FUNCTIONS
// ========================================

// Formatta data per SAP (YYYYMMDD)
function formatDateForSAP(date) {
  const d = new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}${month}${day}`;
}

// Parse data da SAP (/Date(timestamp)/)
function parseSAPDate(sapDate) {
  if (!sapDate) return null;
  const match = sapDate.match(/\/Date\((\d+)\)\//);
  if (match) {
    return new Date(parseInt(match[1])).toISOString().split('T')[0];
  }
  return sapDate;
}

// ========================================
// HEALTH CHECK
// ========================================

app.get('/', (req, res) => {
  res.json({
    status: 'running',
    service: 'Logistics Platform Backend API',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    endpoints: {
      health: 'GET /health',
      if1: 'POST /api/if1/receive-order',
      if2: 'POST /api/if2/receive-transport',
      if7: 'POST /api/if7/send-preinvoice',
      if8: 'POST /api/if8/send-order-confirmation',
      if14: 'GET /api/if14/get-delivery-status/:orderNumber',
      if15: 'GET /api/if15/get-invoice-status/:invoiceNumber',
      orders: 'GET /api/orders',
      transports: 'GET /api/transports',
      preinvoices: 'GET /api/preinvoices'
    }
  });
});

app.get('/health', async (req, res) => {
  try {
    await pool.query('SELECT NOW()');
    res.json({
      status: 'healthy',
      database: 'connected',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      status: 'unhealthy',
      database: 'disconnected',
      error: error.message
    });
  }
});

// ========================================
// IF1: RICEVI ORDINE DA SAP
// ========================================

app.post('/api/if1/receive-order', async (req, res) => {
  const client = await pool.connect();
  
  try {
    console.log('[IF1] Ricezione ordine da SAP...');
    
    const { orderData } = req.body;
    
    if (!orderData || !orderData.SalesOrder) {
      return res.status(400).json({
        success: false,
        error: 'Dati ordine mancanti o non validi'
      });
    }
    
    const orderId = uuidv4();
    
    await client.query('BEGIN');
    
    const insertQuery = `
      INSERT INTO orders (
        id, order_type, sap_order_number, sap_document_date,
        customer_number, vendor_number, bp_name, total_amount,
        currency, payment_terms, delivery_date, plant,
        shipping_point, items, status, received_from_sap_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, CURRENT_TIMESTAMP)
      ON CONFLICT (sap_order_number) 
      DO UPDATE SET
        total_amount = EXCLUDED.total_amount,
        status = EXCLUDED.status,
        items = EXCLUDED.items,
        updated_at = CURRENT_TIMESTAMP
      RETURNING *
    `;
    
    const values = [
      orderId,
      orderData.SalesOrderType || 'SO',
      orderData.SalesOrder,
      parseSAPDate(orderData.SalesOrderDate),
      orderData.SoldToParty,
      orderData.PurchasingOrganization || null,
      orderData.SoldToPartyName || orderData.CustomerName || 'N/A',
      parseFloat(orderData.TotalNetAmount || 0),
      orderData.TransactionCurrency || 'EUR',
      orderData.CustomerPaymentTerms || 'Standard',
      parseSAPDate(orderData.RequestedDeliveryDate),
      orderData.Plant || null,
      orderData.ShippingPoint || null,
      JSON.stringify(orderData.items || []),
      'RECEIVED'
    ];
    
    const result = await client.query(insertQuery, values);
    
    await client.query('COMMIT');
    
    console.log(`[IF1] ✅ Ordine ${orderData.SalesOrder} salvato con successo`);
    
    res.json({
      success: true,
      message: 'Ordine ricevuto e salvato',
      orderId: result.rows[0].id,
      sapOrderNumber: orderData.SalesOrder,
      status: result.rows[0].status
    });
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('[IF1] ❌ Errore:', error.message);
    res.status(500).json({
      success: false,
      error: 'Errore nel salvataggio ordine',
      details: error.message
    });
  } finally {
    client.release();
  }
});

// ========================================
// IF2: RICEVI TRASPORTO DA SAP
// ========================================

app.post('/api/if2/receive-transport', async (req, res) => {
  const client = await pool.connect();
  
  try {
    console.log('[IF2] Ricezione trasporto da SAP...');
    
    const { transportData } = req.body;
    
    if (!transportData || !transportData.DeliveryDocument) {
      return res.status(400).json({
        success: false,
        error: 'Dati trasporto mancanti'
      });
    }
    
    const transportId = uuidv4();
    
    await client.query('BEGIN');
    
    const insertQuery = `
      INSERT INTO transports (
        id, sap_transport_number, transport_date, carrier,
        vehicle_plate, driver_name, driver_phone, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT (sap_transport_number)
      DO UPDATE SET
        status = EXCLUDED.status,
        carrier = EXCLUDED.carrier,
        updated_at = CURRENT_TIMESTAMP
      RETURNING *
    `;
    
    const values = [
      transportId,
      transportData.DeliveryDocument,
      parseSAPDate(transportData.ActualDeliveryDate) || new Date().toISOString().split('T')[0],
      transportData.Carrier || 'TBD',
      transportData.VehiclePlate || null,
      transportData.DriverName || null,
      transportData.DriverPhone || null,
      'CREATED'
    ];
    
    const result = await client.query(insertQuery, values);
    
    // Collega ordine a trasporto se presente
    if (transportData.SalesOrder) {
      await client.query(
        'UPDATE orders SET transport_id = $1, delivery_number = $2 WHERE sap_order_number = $3',
        [transportId, transportData.DeliveryDocument, transportData.SalesOrder]
      );
    }
    
    await client.query('COMMIT');
    
    console.log(`[IF2] ✅ Trasporto ${transportData.DeliveryDocument} salvato`);
    
    res.json({
      success: true,
      message: 'Trasporto ricevuto e salvato',
      transportId: result.rows[0].id,
      sapTransportNumber: transportData.DeliveryDocument
    });
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('[IF2] ❌ Errore:', error.message);
    res.status(500).json({
      success: false,
      error: 'Errore nel salvataggio trasporto',
      details: error.message
    });
  } finally {
    client.release();
  }
});

// ========================================
// IF7: INVIA PREFATTURA A SAP
// ========================================

app.post('/api/if7/send-preinvoice', async (req, res) => {
  const client = await pool.connect();
  
  try {
    console.log('[IF7] Creazione prefattura per SAP...');
    
    const { orderNumber, billingDate, items } = req.body;
    
    if (!orderNumber || !items || items.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Dati prefattura incompleti'
      });
    }
    
    await client.query('BEGIN');
    
    // Recupera ordine
    const orderResult = await client.query(
      'SELECT * FROM orders WHERE sap_order_number = $1',
      [orderNumber]
    );
    
    if (orderResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({
        success: false,
        error: 'Ordine non trovato'
      });
    }
    
    const order = orderResult.rows[0];
    const preinvoiceId = uuidv4();
    const invoiceNumber = `PRE${Date.now()}`;
    
    // Calcola totali
    const netAmount = items.reduce((sum, item) => sum + (item.quantity * item.unitPrice), 0);
    const vatAmount = netAmount * 0.22; // IVA 22%
    const totalAmount = netAmount + vatAmount;
    
    const insertQuery = `
      INSERT INTO preinvoices (
        id, invoice_number, order_id, billing_date,
        total_amount, currency, vat_amount, net_amount,
        payment_terms, due_date, status, items
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING *
    `;
    
    const dueDate = new Date(billingDate || Date.now());
    dueDate.setDate(dueDate.getDate() + 30);
    
    const values = [
      preinvoiceId,
      invoiceNumber,
      order.id,
      billingDate || new Date().toISOString().split('T')[0],
      totalAmount,
      order.currency,
      vatAmount,
      netAmount,
      order.payment_terms,
      dueDate.toISOString().split('T')[0],
      'DRAFT',
      JSON.stringify(items)
    ];
    
    const result = await client.query(insertQuery, values);
    
    // Aggiorna ordine
    await client.query(
      'UPDATE orders SET preinvoice_id = $1, status = $2 WHERE id = $3',
      [preinvoiceId, 'INVOICED', order.id]
    );
    
    // Simula invio a SAP (in produzione userebbe SAP Cloud SDK)
    console.log('[IF7] 📤 Invio prefattura a SAP...');
    
    // Mock SAP response
    const sapInvoiceNumber = `INV${Date.now()}`;
    
    await client.query(
      'UPDATE preinvoices SET sent_to_sap_at = CURRENT_TIMESTAMP, sap_invoice_number = $1, status = $2 WHERE id = $3',
      [sapInvoiceNumber, 'SENT', preinvoiceId]
    );
    
    await client.query('COMMIT');
    
    console.log(`[IF7] ✅ Prefattura ${invoiceNumber} inviata a SAP`);
    
    res.json({
      success: true,
      message: 'Prefattura creata e inviata a SAP',
      preinvoiceId: result.rows[0].id,
      invoiceNumber: invoiceNumber,
      sapInvoiceNumber: sapInvoiceNumber,
      totalAmount: totalAmount,
      status: 'SENT'
    });
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('[IF7] ❌ Errore:', error.message);
    res.status(500).json({
      success: false,
      error: 'Errore nella creazione prefattura',
      details: error.message
    });
  } finally {
    client.release();
  }
});

// ========================================
// IF8: INVIA CONFERMA ORDINE A SAP
// ========================================

app.post('/api/if8/send-order-confirmation', async (req, res) => {
  const client = await pool.connect();
  
  try {
    console.log('[IF8] Invio conferma ordine a SAP...');
    
    const { orderNumber, confirmedItems, notes, confirmedBy } = req.body;
    
    if (!orderNumber || !confirmedItems) {
      return res.status(400).json({
        success: false,
        error: 'Dati conferma incompleti'
      });
    }
    
    await client.query('BEGIN');
    
    // Recupera ordine
    const orderResult = await client.query(
      'SELECT * FROM orders WHERE sap_order_number = $1',
      [orderNumber]
    );
    
    if (orderResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({
        success: false,
        error: 'Ordine non trovato'
      });
    }
    
    const order = orderResult.rows[0];
    const confirmationId = uuidv4();
    
    // Inserisci conferma
    const insertQuery = `
      INSERT INTO order_confirmations (
        id, order_id, confirmation_date, confirmed_items,
        notes, confirmed_by
      ) VALUES ($1, $2, CURRENT_TIMESTAMP, $3, $4, $5)
      RETURNING *
    `;
    
    const values = [
      confirmationId,
      order.id,
      JSON.stringify(confirmedItems),
      notes || null,
      confirmedBy || 'System'
    ];
    
    const result = await client.query(insertQuery, values);
    
    // Simula invio a SAP
    console.log('[IF8] 📤 Invio conferma a SAP...');
    
    const sapConfirmationNumber = `CONF${Date.now()}`;
    
    await client.query(
      'UPDATE order_confirmations SET sent_to_sap_at = CURRENT_TIMESTAMP, sap_confirmation_number = $1 WHERE id = $2',
      [sapConfirmationNumber, confirmationId]
    );
    
    // Aggiorna stato ordine
    await client.query(
      'UPDATE orders SET status = $1, confirmed_at = CURRENT_TIMESTAMP, confirmed_by = $2 WHERE id = $3',
      ['CONFIRMED', confirmedBy, order.id]
    );
    
    await client.query('COMMIT');
    
    console.log(`[IF8] ✅ Conferma ordine ${orderNumber} inviata a SAP`);
    
    res.json({
      success: true,
      message: 'Conferma ordine inviata a SAP',
      confirmationId: result.rows[0].id,
      sapConfirmationNumber: sapConfirmationNumber,
      orderNumber: orderNumber,
      status: 'CONFIRMED'
    });
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('[IF8] ❌ Errore:', error.message);
    res.status(500).json({
      success: false,
      error: 'Errore nell\'invio conferma ordine',
      details: error.message
    });
  } finally {
    client.release();
  }
});

// ========================================
// IF14: GET DELIVERY STATUS
// ========================================

app.get('/api/if14/get-delivery-status/:orderNumber', async (req, res) => {
  try {
    console.log(`[IF14] Richiesta stato consegna per ordine ${req.params.orderNumber}`);
    
    const result = await pool.query(`
      SELECT 
        o.sap_order_number,
        o.status as order_status,
        o.delivery_date,
        o.delivery_number,
        o.goods_issue_date,
        t.sap_transport_number,
        t.transport_date,
        t.carrier,
        t.vehicle_plate,
        t.driver_name,
        t.status as transport_status
      FROM orders o
      LEFT JOIN transports t ON o.transport_id = t.id
      WHERE o.sap_order_number = $1
    `, [req.params.orderNumber]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Ordine non trovato'
      });
    }
    
    const delivery = result.rows[0];
    
    res.json({
      success: true,
      orderNumber: delivery.sap_order_number,
      deliveryStatus: {
        orderStatus: delivery.order_status,
        deliveryDate: delivery.delivery_date,
        deliveryNumber: delivery.delivery_number,
        goodsIssueDate: delivery.goods_issue_date,
        transport: delivery.sap_transport_number ? {
          transportNumber: delivery.sap_transport_number,
          date: delivery.transport_date,
          carrier: delivery.carrier,
          vehiclePlate: delivery.vehicle_plate,
          driver: delivery.driver_name,
          status: delivery.transport_status
        } : null
      }
    });
    
  } catch (error) {
    console.error('[IF14] ❌ Errore:', error.message);
    res.status(500).json({
      success: false,
      error: 'Errore nel recupero stato consegna',
      details: error.message
    });
  }
});

// ========================================
// IF15: GET INVOICE STATUS
// ========================================

app.get('/api/if15/get-invoice-status/:invoiceNumber', async (req, res) => {
  try {
    console.log(`[IF15] Richiesta stato fattura ${req.params.invoiceNumber}`);
    
    const result = await pool.query(`
      SELECT 
        p.invoice_number,
        p.status,
        p.billing_date,
        p.total_amount,
        p.currency,
        p.vat_amount,
        p.net_amount,
        p.due_date,
        p.sent_to_sap_at,
        p.sap_invoice_number,
        o.sap_order_number
      FROM preinvoices p
      LEFT JOIN orders o ON p.order_id = o.id
      WHERE p.invoice_number = $1 OR p.sap_invoice_number = $1
    `, [req.params.invoiceNumber]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Fattura non trovata'
      });
    }
    
    const invoice = result.rows[0];
    
    res.json({
      success: true,
      invoiceNumber: invoice.invoice_number,
      sapInvoiceNumber: invoice.sap_invoice_number,
      invoiceStatus: {
        status: invoice.status,
        billingDate: invoice.billing_date,
        totalAmount: invoice.total_amount,
        currency: invoice.currency,
        vatAmount: invoice.vat_amount,
        netAmount: invoice.net_amount,
        dueDate: invoice.due_date,
        sentToSAP: invoice.sent_to_sap_at ? true : false,
        sentDate: invoice.sent_to_sap_at,
        relatedOrder: invoice.sap_order_number
      }
    });
    
  } catch (error) {
    console.error('[IF15] ❌ Errore:', error.message);
    res.status(500).json({
      success: false,
      error: 'Errore nel recupero stato fattura',
      details: error.message
    });
  }
});

// ========================================
// CRUD ENDPOINTS
// ========================================

// GET: Lista ordini
app.get('/api/orders', async (req, res) => {
  try {
    const { status, limit = 50 } = req.query;
    
    let query = 'SELECT * FROM orders';
    let values = [];
    
    if (status) {
      query += ' WHERE status = $1';
      values.push(status);
    }
    
    query += ' ORDER BY created_at DESC LIMIT $' + (values.length + 1);
    values.push(parseInt(limit));
    
    const result = await pool.query(query, values);
    
    res.json({
      success: true,
      count: result.rows.length,
      orders: result.rows
    });
    
  } catch (error) {
    console.error('[ORDERS] ❌ Errore:', error.message);
    res.status(500).json({
      success: false,
      error: 'Errore nel recupero ordini',
      details: error.message
    });
  }
});

// GET: Lista trasporti
app.get('/api/transports', async (req, res) => {
  try {
    const { status, limit = 50 } = req.query;
    
    let query = 'SELECT * FROM transports';
    let values = [];
    
    if (status) {
      query += ' WHERE status = $1';
      values.push(status);
    }
    
    query += ' ORDER BY created_at DESC LIMIT $' + (values.length + 1);
    values.push(parseInt(limit));
    
    const result = await pool.query(query, values);
    
    res.json({
      success: true,
      count: result.rows.length,
      transports: result.rows
    });
    
  } catch (error) {
    console.error('[TRANSPORTS] ❌ Errore:', error.message);
    res.status(500).json({
      success: false,
      error: 'Errore nel recupero trasporti',
      details: error.message
    });
  }
});

// GET: Lista prefatture
app.get('/api/preinvoices', async (req, res) => {
  try {
    const { status, limit = 50 } = req.query;
    
    let query = 'SELECT * FROM preinvoices';
    let values = [];
    
    if (status) {
      query += ' WHERE status = $1';
      values.push(status);
    }
    
    query += ' ORDER BY created_at DESC LIMIT $' + (values.length + 1);
    values.push(parseInt(limit));
    
    const result = await pool.query(query, values);
    
    res.json({
      success: true,
      count: result.rows.length,
      preinvoices: result.rows
    });
    
  } catch (error) {
    console.error('[PREINVOICES] ❌ Errore:', error.message);
    res.status(500).json({
      success: false,
      error: 'Errore nel recupero prefatture',
      details: error.message
    });
  }
});

// ========================================
// ERROR HANDLING
// ========================================

app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint non trovato',
    path: req.path
  });
});

app.use((error, req, res, next) => {
  console.error('[ERROR]', error);
  res.status(500).json({
    success: false,
    error: 'Errore interno del server',
    message: error.message
  });
});

// ========================================
// START SERVER
// ========================================

app.listen(PORT, () => {
  console.log(`
  ╔════════════════════════════════════════╗
  ║   🚀 LOGISTICS PLATFORM API v1.0.0    ║
  ║   ✅ Server running on port ${PORT}     ║
  ║   📡 Database: PostgreSQL connected    ║
  ║   🌍 Environment: ${process.env.NODE_ENV || 'development'}             ║
  ╚════════════════════════════════════════╝
  
  Endpoints disponibili:
  - GET  /              → Info API
  - GET  /health        → Health check
  - POST /api/if1/...   → IF1-IF8, IF14-IF15
  - GET  /api/orders    → Lista ordini
  - GET  /api/transports    → Lista trasporti
  - GET  /api/preinvoices   → Lista prefatture
  `);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM ricevuto, chiusura graceful...');
  pool.end(() => {
    console.log('Pool PostgreSQL chiuso');
    process.exit(0);
  });
});
