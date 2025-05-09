// /api/buscar.js
import axios from 'axios';
import nodemailer from 'nodemailer';

// Configuración centralizada
const CONFIG = {
  PRIMA_MAXIMA: 5, // % sobre precio mercado
  REPUTACION_MINIMA: 1,
  METODOS_PAGO: ["SEPA (EU)", "SEPA (EU) bank transfer", "SEPA (EU) Instant", "Revolut"],
  LIMITE_OFERTAS: 50,
  TIMEOUT: 10000 // 10 segundos
};

// Validar variables de entorno al cargar
if (!process.env.mail_gmail || !process.env.pass_gmail || !process.env.mail_hotmail) {
  console.error("❌ Error: Faltan variables de entorno requeridas");
  throw new Error("Configuración incompleta");
}

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.mail_gmail,
    pass: process.env.pass_gmail
  }
});

async function enviarCorreo(ofertas) {
  const cuerpo = ofertas.map(oferta => `
💰 Precio: ${oferta.price} € (${oferta.prima})
👤 Vendedor: ${oferta.vendedor} (Reputación: ${oferta.reputation})
💳 Métodos: ${oferta.metodos.join(', ')}
🔗 Enlace: https://hodlhodl.com/offers/${oferta.id}
-----------------------`).join('\n');

  try {
    await transporter.sendMail({
      from: `"Monitor HodlHodl" <${process.env.mail_gmail}>`,
      to: process.env.mail_hotmail,
      subject: `📊 ${ofertas.length} Ofertas Disponibles`,
      text: cuerpo
    });
    console.log("✅ Correo enviado correctamente");
  } catch (error) {
    console.error("❌ Error enviando correo:", error);
    throw error;
  }
}

export default async function handler(req, res) {
  try {
    console.log("🔍 Iniciando búsqueda de ofertas...");

    // 1. Obtener precio BTC
    const precioBTC = await obtenerPrecioBTC();
    console.log("💰 Precio BTC actual:", precioBTC, "EUR");

    // 2. Obtener ofertas
    const ofertas = await obtenerOfertas();
    console.log(`📊 ${ofertas.length} ofertas obtenidas`);

    // 3. Filtrar ofertas
    const ofertasFiltradas = filtrarOfertas(ofertas, precioBTC);
    console.log(`✅ ${ofertasFiltradas.length} ofertas válidas encontradas`);

    // 4. Procesar resultados
    if (ofertasFiltradas.length > 0) {
      await enviarCorreo(ofertasFiltradas);
      return res.status(200).json({
        success: true,
        count: ofertasFiltradas.length,
        ofertas: ofertasFiltradas
      });
    } else {
      console.log("ℹ️ No se encontraron ofertas válidas");
      return res.status(200).json({
        success: false,
        message: "No hay ofertas que cumplan los criterios actuales"
      });
    }
  } catch (error) {
    console.error("❌ Error en el handler:", error.message);
    return res.status(500).json({
      success: false,
      error: "Error procesando la solicitud",
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}

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
