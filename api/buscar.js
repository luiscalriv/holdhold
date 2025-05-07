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
    // 1. Obtener IDs de métodos de pago deseados
    const { data: pmData } = await axios.get('https://hodlhodl.com/api/v1/payment_methods');
    const metodosDeseados = ["SEPA (EU)", "Revolut"];
    const metodoIDs = pmData.payment_methods
      .filter(pm => metodosDeseados.includes(pm.name))
      .map(pm => pm.id);

    if (!metodoIDs.length) {
      return res.status(500).send("No se encontraron métodos de pago válidos.");
    }

    // 2. Obtener precio actual de BTC en euros (CoinGecko)
    const { data: precioData } = await axios.get('https://api.coingecko.com/api/v3/simple/price', {
      params: {
        ids: 'bitcoin',
        vs_currencies: 'eur'
      }
    });
    const precioBTC = precioData.bitcoin.eur;
console.log("💶 Precio actual BTC/EUR:", precioBTC);
    // 3. Obtener ofertas
    const { data } = await axios.get('https://hodlhodl.com/api/v1/offers', {
      params: {
        type: 'buy',
        currency_code: 'EUR',
        payment_method_ids: metodoIDs.join(','),
        limit: 50
      }
    });

    const ofertasFiltradas = data.offers.filter(oferta => {
      const price = parseFloat(oferta.price);
      const metodos = oferta.payment_methods?.map(pm => pm.name) || [];
      const vendedor = oferta.user?.login;
      return (
        price > 0 &&
        price < precioBTC &&
        vendedor &&
        metodos.some(m => metodosDeseados.includes(m))
      );
    }).map(oferta => ({
      id: oferta.id,
      vendedor: oferta.user?.login || "Desconocido",
      price: oferta.price,
      metodos: oferta.payment_methods?.map(pm => pm.name) || []
    }));

    if (ofertasFiltradas.length) {
      await enviarCorreo(ofertasFiltradas);
      return res.status(200).send(`Se notificaron ${ofertasFiltradas.length} ofertas.`);
    } else {
      return res.status(200).send("Sin ofertas relevantes.");
    }
  } catch (err) {
    console.error("❌ Error:", err.message);
    res.status(500).send("Error al buscar ofertas");
  }
}
