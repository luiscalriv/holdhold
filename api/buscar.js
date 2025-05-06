// /api/buscar.js
import axios from 'axios';
import nodemailer from 'nodemailer';

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

    // 2. Obtener ofertas filtradas por método de pago
    const { data } = await axios.get('https://hodlhodl.com/api/v1/offers', {
      params: {
        type: 'buy',
        currency_code: 'EUR',
        payment_method_ids: metodoIDs.join(','),
        limit: 20
      }
    });

    const ofertas = data.offers;

    if (!ofertas.length) {
      return res.status(200).send("No se encontraron ofertas.");
    }

    // Mostrar todos los datos de la primera oferta
    const primeraOferta = ofertas[0];
    console.log("🔍 Oferta completa:", primeraOferta);

    // También la devolvemos como respuesta JSON
    return res.status(200).json(primeraOferta);

  } catch (err) {
    console.error("❌ Error:", err.message);
    res.status(500).send("Error al buscar ofertas");
  }
}
