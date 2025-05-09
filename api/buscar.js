// /api/buscar.js
import axios from 'axios';
import nodemailer from 'nodemailer';

// CONFIGURACIÓN ACTUALIZADA
const CONFIG = {
  PRIMA_MAXIMA: 10, // % sobre precio mercado (aumentado)
  METODOS_PAGO: ["SEPA", "Revolut"], // Coincidencias parciales
  PRECIO_MAXIMO: 100000,
  LIMITE_OFERTAS: 50,
  TIMEOUT: 10000
};

// ... (mantén igual la parte de transporter y enviarCorreo)

export default async function handler(req, res) {
  try {
    console.log("🔍 Iniciando búsqueda...");

    // 1. Obtener precio BTC
    const precioBTC = await obtenerPrecioBTC();
    console.log("💰 Precio BTC:", precioBTC, "EUR");

    // 2. Obtener ofertas
    const ofertas = await obtenerOfertas();
    console.log(`📊 ${ofertas.length} ofertas obtenidas`);

    // 3. Filtrar ofertas (CON CONDICIONES ACTUALIZADAS)
    const ofertasFiltradas = ofertas.filter(oferta => {
      try {
        const price = parseFloat(oferta.price);
        const metodos = oferta.payment_methods?.map(pm => pm.name) || [];
        const vendedor = oferta.trader?.login || oferta.user?.login;

        // Cálculos actualizados
        const prima = ((price - precioBTC) / precioBTC) * 100;
        const precioValido = price > 0 && price < CONFIG.PRECIO_MAXIMO;
        const metodoValido = CONFIG.METODOS_PAGO.some(metodo => 
          metodos.some(m => m.includes(metodo))
        );

        console.log(`🔎 Oferta ${oferta.id}:`, {
          price,
          prima: prima.toFixed(2) + '%',
          metodos,
          vendedor: vendedor || "Anónimo",
          valido: precioValido && prima <= CONFIG.PRIMA_MAXIMA && metodoValido
        });

        return (
          precioValido &&
          prima <= CONFIG.PRIMA_MAXIMA &&
          metodoValido
          // ELIMINADO EL FILTRO DE REPUTACIÓN
        );
      } catch (error) {
        console.error(`⚠️ Error en oferta ${oferta.id}:`, error.message);
        return false;
      }
    }).map(oferta => ({
      id: oferta.id,
      vendedor: oferta.trader?.login || oferta.user?.login || "Anónimo",
      price: oferta.price,
      prima: ((parseFloat(oferta.price) - precioBTC) / precioBTC * 100).toFixed(2) + '%',
      metodos: oferta.payment_methods?.map(pm => pm.name) || []
    }));

    console.log(`✅ ${ofertasFiltradas.length} ofertas válidas`, ofertasFiltradas);

    // ... (mantén igual el resto del handler)
  } catch (error) {
    console.error("❌ Error:", error.message);
    return res.status(500).json({
      success: false,
      error: "Error en el servidor",
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}

// ... (mantén igual las funciones auxiliares)

// Funciones auxiliares
async function obtenerPrecioBTC() {
  try {
    const { data } = await axios.get('https://api.coingecko.com/api/v3/simple/price', {
      params: { ids: 'bitcoin', vs_currencies: 'eur' },
      timeout: CONFIG.TIMEOUT
    });
    return data.bitcoin.eur;
  } catch (error) {
    console.error("❌ Error obteniendo precio BTC:", error.message);
    throw new Error("No se pudo obtener el precio de Bitcoin");
  }
}

async function obtenerOfertas() {
  try {
    const { data } = await axios.get('https://hodlhodl.com/api/v1/offers', {
      params: {
        type: 'buy',
        currency_code: 'EUR',
        limit: CONFIG.LIMITE_OFERTAS
      },
      timeout: CONFIG.TIMEOUT
    });
    return data.offers || [];
  } catch (error) {
    console.error("❌ Error obteniendo ofertas:", error.message);
    throw new Error("No se pudieron obtener las ofertas");
  }
}

function filtrarOfertas(ofertas, precioBTC) {
  return ofertas.filter(oferta => {
    try {
      const price = parseFloat(oferta.price);
      const metodos = oferta.payment_methods?.map(pm => pm.name) || [];
      const vendedor = oferta.trader?.login || oferta.user?.login;
      const reputation = oferta.trader?.reputation?.positive_count || 
                       oferta.user?.reputation?.positive_count || 0;

      // Cálculos
      const prima = ((price - precioBTC) / precioBTC) * 100;
      const precioValido = price > 0 && price < (precioBTC * 2);

      // Debug detallado
      console.log(`🔎 Analizando oferta ${oferta.id}:`, {
        price,
        prima: prima.toFixed(2) + '%',
        metodos,
        vendedor: vendedor || "Anónimo",
        reputation,
        valido: precioValido && prima <= CONFIG.PRIMA_MAXIMA && 
               metodos.some(m => CONFIG.METODOS_PAGO.some(d => m.includes(d))) &&
               reputation >= CONFIG.REPUTACION_MINIMA
      });

      return (
        precioValido &&
        prima <= CONFIG.PRIMA_MAXIMA &&
        metodos.some(m => CONFIG.METODOS_PAGO.some(d => m.includes(d))) &&
        reputation >= CONFIG.REPUTACION_MINIMA
      );
    } catch (error) {
      console.error(`⚠️ Error procesando oferta ${oferta?.id}:`, error.message);
      return false;
    }
  }).map(oferta => ({
    id: oferta.id,
    vendedor: oferta.trader?.login || oferta.user?.login || "Anónimo",
    reputation: oferta.trader?.reputation?.positive_count || 
               oferta.user?.reputation?.positive_count || 0,
    price: oferta.price,
    prima: ((parseFloat(oferta.price) - precioBTC) / precioBTC * 100).toFixed(2) + '%',
    metodos: oferta.payment_methods?.map(pm => pm.name) || []
  }));
}
