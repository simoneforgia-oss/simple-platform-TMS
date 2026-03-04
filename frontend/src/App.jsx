import { useState, useEffect } from 'react'
import axios from 'axios'
import './App.css'

const API_URL = 'https://simple-platform-tms-fb4-production.up.railway.app'

function App() {
  const [ordini, setOrdini] = useState([])
  const [trasporti, setTrasporti] = useState([])
  const [prefatture, setPrefatture] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const [nuovoOrdine, setNuovoOrdine] = useState({
    numero_ordine: '',
    cliente: '',
    prodotto: '',
    quantita: '',
    prezzo_unitario: ''
  })

  const [nuovoTrasporto, setNuovoTrasporto] = useState({
    ordine_id: '',
    vettore: '',
    tracking_number: '',
    data_partenza: ''
  })

  useEffect(() => {
    caricaDati()
  }, [])

  const caricaDati = async () => {
    try {
      setLoading(true)
      const [ordiniRes, trasportiRes, prefattureRes] = await Promise.all([
        axios.get(`${API_URL}/api/orders`),
        axios.get(`${API_URL}/api/transports`),
        axios.get(`${API_URL}/api/preinvoices`)
      ])
      setOrdini(ordiniRes.data)
      setTrasporti(trasportiRes.data)
      setPrefatture(prefattureRes.data)
      setError('')
    } catch (err) {
      setError('Errore caricamento dati: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  const creaOrdine = async (e) => {
    e.preventDefault()
    try {
      setLoading(true)
      await axios.post(`${API_URL}/api/orders`, {
        ...nuovoOrdine,
        quantita: parseInt(nuovoOrdine.quantita),
        prezzo_unitario: parseFloat(nuovoOrdine.prezzo_unitario)
      })
      setSuccess('Ordine creato con successo!')
      setNuovoOrdine({
        numero_ordine: '',
        cliente: '',
        prodotto: '',
        quantita: '',
        prezzo_unitario: ''
      })
      caricaDati()
    } catch (err) {
      setError('Errore creazione ordine: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  const creaTrasporto = async (e) => {
    e.preventDefault()
    try {
      setLoading(true)
      await axios.post(`${API_URL}/api/transports`, {
        ...nuovoTrasporto,
        ordine_id: parseInt(nuovoTrasporto.ordine_id)
      })
      setSuccess('Trasporto registrato con successo!')
      setNuovoTrasporto({
        ordine_id: '',
        vettore: '',
        tracking_number: '',
        data_partenza: ''
      })
      caricaDati()
    } catch (err) {
      setError('Errore registrazione trasporto: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  const aggiornaStatoTrasporto = async (id, nuovoStato) => {
    try {
      setLoading(true)
      await axios.put(`${API_URL}/api/transports/${id}/status`, { stato: nuovoStato })
      setSuccess('Stato trasporto aggiornato!')
      caricaDati()
    } catch (err) {
      setError('Errore aggiornamento stato: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  const generaPrefattura = async (ordineId) => {
    try {
      setLoading(true)
      await axios.post(`${API_URL}/api/preinvoices`, { ordine_id: ordineId })
      setSuccess('Prefattura generata con successo!')
      caricaDati()
    } catch (err) {
      setError('Errore generazione prefattura: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="app">
      <header>
        <h1>🚚 Logistics Platform TMS</h1>
        <p>Dashboard ordini, trasporti e prefatture collegata al backend Railway</p>
      </header>

      {loading && <div className="banner loading">⏳ Operazione in corso...</div>}
      {error && (
        <div className="banner error" onClick={() => setError('')}>
          ❌ {error}
        </div>
      )}
      {success && (
        <div className="banner success" onClick={() => setSuccess('')}>
          ✅ {success}
        </div>
      )}

      <section className="stats">
        <div className="card">
          <h2>📦 Ordini</h2>
          <p className="big">{ordini.length}</p>
          <p>Totale ordini registrati</p>
        </div>
        <div className="card">
          <h2>🚛 Trasporti</h2>
          <p className="big">{trasporti.length}</p>
          <p>Spedizioni tracciate</p>
        </div>
        <div className="card">
          <h2>💰 Prefatture</h2>
          <p className="big">{prefatture.length}</p>
          <p>Documenti di fatturazione</p>
        </div>
      </section>

      <section className="panel">
        <h2>➕ Nuovo Ordine (IF1)</h2>
        <form className="form-grid" onSubmit={creaOrdine}>
          <input
            type="text"
            placeholder="N° Ordine"
            value={nuovoOrdine.numero_ordine}
            onChange={(e) => setNuovoOrdine({ ...nuovoOrdine, numero_ordine: e.target.value })}
            required
          />
          <input
            type="text"
            placeholder="Cliente"
            value={nuovoOrdine.cliente}
            onChange={(e) => setNuovoOrdine({ ...nuovoOrdine, cliente: e.target.value })}
            required
          />
          <input
            type="text"
            placeholder="Prodotto"
            value={nuovoOrdine.prodotto}
            onChange={(e) => setNuovoOrdine({ ...nuovoOrdine, prodotto: e.target.value })}
            required
          />
          <input
            type="number"
            placeholder="Quantità"
            value={nuovoOrdine.quantita}
            onChange={(e) => setNuovoOrdine({ ...nuovoOrdine, quantita: e.target.value })}
            required
          />
          <input
            type="number"
            step="0.01"
            placeholder="Prezzo €"
            value={nuovoOrdine.prezzo_unitario}
            onChange={(e) => setNuovoOrdine({ ...nuovoOrdine, prezzo_unitario: e.target.value })}
            required
          />
          <button type="submit">Crea Ordine</button>
        </form>
      </section>

      <section className="panel">
        <h2>📋 Ordini (IF2 + IF7)</h2>
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>N° Ordine</th>
              <th>Cliente</th>
              <th>Prodotto</th>
              <th>Q.tà</th>
              <th>Prezzo €</th>
              <th>Totale €</th>
              <th>Azioni</th>
            </tr>
          </thead>
          <tbody>
            {ordini.map((o) => (
              <tr key={o.id}>
                <td>{o.id}</td>
                <td>{o.numero_ordine}</td>
                <td>{o.cliente}</td>
                <td>{o.prodotto}</td>
                <td>{o.quantita}</td>
                <td>{o.prezzo_unitario}</td>
                <td>{(o.quantita * o.prezzo_unitario).toFixed(2)}</td>
                <td>
                  <button
                    onClick={() => generaPrefattura(o.id)}
                    disabled={prefatture.some((p) => p.ordine_id === o.id)}
                  >
                    {prefatture.some((p) => p.ordine_id === o.id)
                      ? 'Già fatturato'
                      : 'Genera prefattura'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="panel">
        <h2>🚚 Nuovo Trasporto (IF3)</h2>
        <form className="form-grid" onSubmit={creaTrasporto}>
          <input
            type="number"
            placeholder="ID Ordine"
            value={nuovoTrasporto.ordine_id}
            onChange={(e) => setNuovoTrasporto({ ...nuovoTrasporto, ordine_id: e.target.value })}
            required
          />
          <input
            type="text"
            placeholder="Vettore"
            value={nuovoTrasporto.vettore}
            onChange={(e) => setNuovoTrasporto({ ...nuovoTrasporto, vettore: e.target.value })}
            required
          />
          <input
            type="text"
            placeholder="Tracking"
            value={nuovoTrasporto.tracking_number}
            onChange={(e) =>
              setNuovoTrasporto({ ...nuovoTrasporto, tracking_number: e.target.value })
            }
            required
          />
          <input
            type="date"
            placeholder="Data partenza"
            value={nuovoTrasporto.data_partenza}
            onChange={(e) =>
              setNuovoTrasporto({ ...nuovoTrasporto, data_partenza: e.target.value })
            }
            required
          />
          <button type="submit">Registra Trasporto</button>
        </form>
      </section>

      <section className="panel">
        <h2>🚛 Trasporti (IF4 + IF5)</h2>
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>Ordine</th>
              <th>Vettore</th>
              <th>Tracking</th>
              <th>Data partenza</th>
              <th>Stato</th>
              <th>Aggiorna</th>
            </tr>
          </thead>
          <tbody>
            {trasporti.map((t) => (
              <tr key={t.id}>
                <td>{t.id}</td>
                <td>{t.ordine_id}</td>
                <td>{t.vettore}</td>
                <td>{t.tracking_number}</td>
                <td>{new Date(t.data_partenza).toLocaleDateString('it-IT')}</td>
                <td>{t.stato}</td>
                <td>
                  <button
                    onClick={() => aggiornaStatoTrasporto(t.id, 'in_transito')}
                    disabled={t.stato === 'consegnato'}
                  >
                    In transito
                  </button>
                  <button
                    onClick={() => aggiornaStatoTrasporto(t.id, 'consegnato')}
                    disabled={t.stato === 'consegnato'}
                  >
                    Consegnato
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="panel">
        <h2>💰 Prefatture (IF6 + IF8)</h2>
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>Ordine</th>
              <th>Numero</th>
              <th>Importo €</th>
              <th>Data</th>
              <th>Stato</th>
            </tr>
          </thead>
          <tbody>
            {prefatture.map((p) => (
              <tr key={p.id}>
                <td>{p.id}</td>
                <td>{p.ordine_id}</td>
                <td>{p.numero_prefattura}</td>
                <td>{parseFloat(p.importo_totale).toFixed(2)}</td>
                <td>{new Date(p.data_emissione).toLocaleDateString('it-IT')}</td>
                <td>{p.stato}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  )
}

export default App