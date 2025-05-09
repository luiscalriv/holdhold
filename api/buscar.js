// /api/buscar.js
import axios from 'axios';
import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.mail_gmail,
    pass: process.env.pass_gmail
  }
});

async function enviarCorreo(ofertas) {
  const cuerpo = ofertas.map(oferta => `
💰 Precio: ${oferta.price} €
👤 Vendedor: ${oferta.vendedor}
💳 Métodos de pago: ${oferta.metodos.join(', ')}
🔗 Link: https://hodlhodl.com/offers/${oferta.id}
  `).join('\n');

  await transporter.sendMail({
    from: `"Monitor HodlHodl" <${process.env.mail_gmail}>`,
    to: process.env.mail_hotmail,
    subject: "📬 Ofertas HodlHodl disponibles",
    text: cuerpo
  });

  console.log("📧 Correo con ofertas enviado");
}

export default async function handler(req, res) {
  try {
    // 1. Configuración
    const PORCENTAJE_MAXIMO_PRIMA = 5; // 5% sobre precio mercado
    const REPUTACION_MINIMA = 1; // Reducido porque muchos no tienen reputación
    const metodosDeseados = ["SEPA (EU)", "SEPA (EU) bank transfer", "SEPA (EU) Instant", "Revolut"];

    // 2. Obtener precio BTC
    const { data: precioData } = await axios.get('https://api.coingecko.com/api/v3/simple/price', {
      params: { ids: 'bitcoin', vs_currencies: 'eur' }
    });
    const precioBTC = precioData.bitcoin.eur;
    console.log("💰 Precio BTC:", precioBTC, "EUR");

    // 3. Obtener ofertas
    const { data } = await axios.get('https://hodlhodl.com/api/v1/offers', {
      params: {
        type: 'buy',
        currency_code: 'EUR',
        limit: 50
      }
    });

    console.log(`📊 ${data.offers?.length || 0} ofertas encontradas`);

    // 4. Filtrar ofertas (condiciones más flexibles)
    const ofertasFiltradas = data.offers.filter(oferta => {
      try {
        const price = parseFloat(oferta.price);
        const metodos = oferta.payment_methods?.map(pm => pm.name) || [];
        const vendedor = oferta.trader?.login || oferta.user?.login; // Campo alternativo
        const reputation = oferta.trader?.reputation?.positive_count || 
                          oferta.user?.reputation?.positive_count || 
                          0;

        // Calcular prima porcentual
        const prima = ((price - precioBTC) / precioBTC) * 100;
        const precioValido = price > 0 && price < (precioBTC * 2); // Filtra precios absurdos

        // Debug
        console.log(`Oferta ${oferta.id}:`, {
          price,
          prima: prima.toFixed(2) + '%',
          metodos,
          vendedor,
          reputation,
          valido: precioValido && prima <= PORCENTAJE_MAXIMO_PRIMA && 
                 metodos.some(m => metodosDeseados.some(d => m.includes(d)))
        });

        return (
          precioValido &&
          prima <= PORCENTAJE_MAXIMO_PRIMA &&
          metodos.some(m => metodosDeseados.some(d => m.includes(d))) && // Match parcial
          reputation >= REPUTACION_MINIMA
        );
      } catch (e) {
        console.error("Error procesando oferta:", e);
        return false;
      }
    }).map(oferta => {
      const price = parseFloat(oferta.price);
      const prima = ((price - precioBTC) / precioBTC) * 100;
      
      return {
        id: oferta.id,
        vendedor: oferta.trader?.login || oferta.user?.login || "Anónimo",
        reputation: oferta.trader?.reputation?.positive_count || 
                   oferta.user?.reputation?.positive_count || 
                   0,
        price: oferta.price,
        prima: prima.toFixed(2) + '%',
        metodos: oferta.payment_methods?.map(pm => pm.name) || []
      };
    });

    console.log(`✅ ${ofertasFiltradas.length} ofertas filtradas`, ofertasFiltradas);

    if (ofertasFiltradas.length) {
      await enviarCorreo(ofertasFiltradas);
      return res.status(200).json({ 
        success: true,
        count: ofertasFiltradas.length,
        ofertas: ofertasFiltradas 
      });
    } else {
      return res.status(200).json({ 
        success: false,
        message: "No hay ofertas que cumplan los criterios" 
      });
    }
  } catch (err) {
    console.error("❌ Error:", err);
    return res.status(500).json({ 
      success: false,
      error: err.message 
    });
  }
}
