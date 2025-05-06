// /api/buscar.js
import axios from 'axios';

export default async function handler(req, res) {
  try {
    // 1. Obtener IDs de métodos de pago deseados
    const { data: pmData } = await axios.get('https://hodlhodl.com/api/v1/payment_methods');
    const metodosDeseados = ["SEPA (EU)", "Revolut"];
    const metodosFiltrados = pmData.payment_methods.filter(pm =>
      metodosDeseados.includes(pm.name)
    );
    const metodoIDs = metodosFiltrados.map(pm => pm.id);

    if (metodoIDs.length === 0) {
      return res.status(500).send("No se encontraron métodos de pago válidos.");
    }

    // 2. Obtener ofertas sin fiarse del filtro de currency_code
    const { data } = await axios.get('https://hodlhodl.com/api/v1/offers', {
      params: {
        type: 'buy',
        payment_method_ids: metodoIDs.join(','),
        limit: 20
      }
    });

    // 3. Filtrar manualmente por moneda EUR
    const ofertasEUR = data.offers.filter(oferta => oferta.currency_code === "EUR");

    if (!ofertasEUR.length) {
      return res.status(200).send("No se encontraron ofertas en EUR.");
    }

    const primera = ofertasEUR[0];
    console.log("🔍 Primera oferta válida (EUR):", primera);

    return res.status(200).json(primera);
  } catch (err) {
    console.error("❌ Error:", err.message);
    res.status(500).send("Error al buscar ofertas");
  }
}
