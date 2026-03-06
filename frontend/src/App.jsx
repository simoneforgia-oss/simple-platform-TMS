import React, { useState, useEffect } from 'react';

// ATTENZIONE: Inserisci qui l'URL esatto del tuo Railway (senza slash finale)
const API_URL = 'https://simple-platform-tms-production.up.railway.app';

export default function App() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);

  // Funzione per scaricare gli ordini dal DB
  const fetchOrders = async () => {
    try {
      const response = await fetch(`${API_URL}/api/orders`);
      const data = await response.json();
      setOrders(data);
      setLoading(false);
    } catch (error) {
      console.error("Errore nel caricamento dati:", error);
      setLoading(false);
    }
  };

  // Carica i dati all'apertura della pagina
  useEffect(() => {
    fetchOrders();
  }, []);

  // Funzione attivata dal bottone "Conferma"
  const handleConfirm = async (orderId) => {
    try {
      await fetch(`${API_URL}/api/orders/${orderId}/confirm`, {
        method: 'PUT',
      });
      // Ricarica la tabella per mostrare il nuovo stato
      fetchOrders(); 
      alert("Ordine confermato! (Qui poi faremo partire l'integrazione verso SAP)");
    } catch (error) {
      alert("Errore durante la conferma");
    }
  };

  return (
    <div style={{ fontFamily: 'Arial, sans-serif', padding: '30px', backgroundColor: '#f4f7f6', minHeight: '100vh' }}>
      <header style={{ marginBottom: '30px', borderBottom: '2px solid #005A9E', paddingBottom: '10px' }}>
        <h1 style={{ color: '#005A9E', margin: 0 }}>🚚 Logistics Platform TMS</h1>
        <p style={{ color: '#555', margin: '5px 0 0 0' }}>Gestione Ordini Integrati con SAP S/4HANA</p>
      </header>

      <div style={{ backgroundColor: 'white', padding: '20px', borderRadius: '8px', boxShadow: '0 4px 8px rgba(0,0,0,0.1)' }}>
        <h2 style={{ marginTop: 0, color: '#333' }}>📦 Lista Ordini in Ingresso</h2>
        
        {loading ? (
          <p>Caricamento dati in corso...</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '15px' }}>
            <thead>
              <tr style={{ backgroundColor: '#005A9E', color: 'white', textAlign: 'left' }}>
                <th style={{ padding: '12px', border: '1px solid #ddd' }}>N° Ordine SAP</th>
                <th style={{ padding: '12px', border: '1px solid #ddd' }}>Cliente BP</th>
                <th style={{ padding: '12px', border: '1px solid #ddd' }}>Importo Totale</th>
                <th style={{ padding: '12px', border: '1px solid #ddd' }}>Data Ricezione</th>
                <th style={{ padding: '12px', border: '1px solid #ddd' }}>Stato</th>
                <th style={{ padding: '12px', border: '1px solid #ddd', textAlign: 'center' }}>Azione</th>
              </tr>
            </thead>
            <tbody>
              {orders.length === 0 ? (
                <tr><td colSpan="6" style={{ padding: '20px', textAlign: 'center' }}>Nessun ordine ricevuto da SAP.</td></tr>
              ) : (
                orders.map((order) => (
                  <tr key={order.id} style={{ borderBottom: '1px solid #eee' }}>
                    <td style={{ padding: '12px', fontWeight: 'bold' }}>{order.sap_order_number}</td>
                    <td style={{ padding: '12px' }}>{order.bp_name}</td>
                    <td style={{ padding: '12px' }}>€ {order.total_amount}</td>
                    <td style={{ padding: '12px' }}>{new Date(order.received_from_sap_at).toLocaleString('it-IT')}</td>
                    <td style={{ padding: '12px' }}>
                      <span style={{
                        padding: '5px 10px', 
                        borderRadius: '20px', 
                        fontSize: '12px', 
                        fontWeight: 'bold',
                        backgroundColor: order.status === 'CONFERMATO_DA_TMS' ? '#d4edda' : '#fff3cd',
                        color: order.status === 'CONFERMATO_DA_TMS' ? '#155724' : '#856404'
                      }}>
                        {order.status}
                      </span>
                    </td>
                    <td style={{ padding: '12px', textAlign: 'center' }}>
                      <button 
                        onClick={() => handleConfirm(order.id)}
                        disabled={order.status === 'CONFERMATO_DA_TMS'}
                        style={{
                          padding: '8px 15px',
                          backgroundColor: order.status === 'CONFERMATO_DA_TMS' ? '#ccc' : '#28a745',
                          color: 'white',
                          border: 'none',
                          borderRadius: '4px',
                          cursor: order.status === 'CONFERMATO_DA_TMS' ? 'not-allowed' : 'pointer',
                          fontWeight: 'bold'
                        }}
                      >
                        {order.status === 'CONFERMATO_DA_TMS' ? '✔ Confermato' : 'Conferma'}
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}