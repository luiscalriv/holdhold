// /api/buscar.js
import axios from 'axios';
import nodemailer from 'nodemailer';

// CONFIGURACIÓN
const CONFIG = {
  PRIMA_MAXIMA: 1, // % sobre precio mercado
  METODOS_PAGO: ["SEPA", "Revolut"],
  PRECIO_MAXIMO: 100000,
  TIMEOUT: 10000
};

// Configurar transporte de correo
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.mail_gmail,
    pass: process.env.pass_gmail
  }
});

// Enviar correo con ofertas
async function enviarCorreo(ofertas) {
  const cuerpo = ofertas.map(oferta => `
💰 Precio: ${oferta.price} €
📉 Prima: ${oferta.prima}
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
}

// Función principal del endpoint
export default async function handler(req, res) {
  try {
    const precioBTC = await obtenerPrecioBTC();
    const ofertas = await obtenerTodasLasOfertas();

    const ofertasFiltradas = ofertas.filter(oferta => {
      try {
        const price = parseFloat(oferta.price);
        const metodos = oferta.payment_methods?.map(pm => pm.name) || [];
        const prima = ((price - precioBTC) / precioBTC) * 100;

        const precioValido = price > 0 && price < CONFIG.PRECIO_MAXIMO;
        const metodoValido = CONFIG.METODOS_PAGO.some(metodo =>
          metodos.some(m => m.includes(metodo))
        );

        return precioValido && prima <= CONFIG.PRIMA_MAXIMA && metodoValido;
      } catch {
        return false;
      }
    }).map(oferta => ({
      id: oferta.id,
      vendedor: oferta.trader?.login || oferta.user?.login || "Anónimo",
      price: oferta.price,
      prima: ((parseFloat(oferta.price) - precioBTC) / precioBTC * 100).toFixed(2) + '%',
      metodos: oferta.payment_methods?.map(pm => pm.name) || []
    }));

    if (ofertasFiltradas.length) {
      await enviarCorreo(ofertasFiltradas);
      return res.status(200).send("Correo enviado");
    } else {
      return res.status(200).send("Sin ofertas relevantes.");
    }
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: "Error en el servidor"
    });
  }
}

// Obtener el precio actual del BTC en euros
async function obtenerPrecioBTC() {
  const { data } = await axios.get('https://api.coingecko.com/api/v3/simple/price', {
    params: { ids: 'bitcoin', vs_currencies: 'eur' },
    timeout: CONFIG.TIMEOUT
  });
  return data.bitcoin.eur;
}

// Obtener todas las ofertas con paginación
async function obtenerTodasLasOfertas() {
  const todas = [];
  const limit = 100;
  let offset = 0;
  let continuar = true;

  while (continuar) {
    const { data } = await axios.get('https://hodlhodl.com/api/v1/offers', {
      params: {
        "pagination[limit]": limit,
        "pagination[offset]": offset,
        "filters[side]": "buy",
        "filters[currency_code]": "EUR",
        "filters[include_global]": true,
        "filters[only_working_now]": false
      },
      timeout: CONFIG.TIMEOUT
    });

    const ofertas = data.offers || [];
    todas.push(...ofertas);

    if (ofertas.length < limit) {
      continuar = false;
    } else {
      offset += limit;
    }
  }

  console.log(`Total de ofertas recibidas: ${todas.length}`);
  return todas;
}
