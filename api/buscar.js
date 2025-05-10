// /api/buscar.js
import axios from 'axios';
import nodemailer from 'nodemailer';
import { kv } from '@vercel/kv';

// CONFIGURACIÓN
const CONFIG = {
  PRIMA_MAXIMA: 1, // % sobre precio mercado
  METODOS_PAGO: ["SEPA", "Revolut"],
  TIMEOUT: 10000,
  KV_KEY: 'ids_enviados' // clave en KV donde guardamos los IDs
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
    subject: "📬 Nuevas ofertas HodlHodl disponibles",
    text: cuerpo
  });
}

// Función principal del endpoint
export default async function handler(req, res) {
  try {
    const precioBTC = await obtenerPrecioBTC();
    const ofertas = await obtenerTodasLasOfertas();

    // Filtrado de ofertas válidas
    const ofertasFiltradas = ofertas.filter(oferta => {
      try {
        const price = parseFloat(oferta.price);
        const prima = ((price - precioBTC) / precioBTC) * 100;
        const instrucciones = oferta.payment_method_instructions || [];
        const metodos = instrucciones.map(inst => inst.payment_method_name).filter(Boolean);

        const metodoValido = CONFIG.METODOS_PAGO.some(metodo =>
          metodos.some(nombre =>
            nombre.toLowerCase().includes(metodo.toLowerCase())
          )
        );
        const primaValida = prima <= CONFIG.PRIMA_MAXIMA;

        return metodoValido && primaValida;
      } catch {
        return false;
      }
    }).map(oferta => {
      const instrucciones = oferta.payment_method_instructions || [];
      const metodos = instrucciones.map(inst => inst.payment_method_name).filter(Boolean);

      return {
        id: oferta.id,
        vendedor: oferta.trader?.login || oferta.user?.login || "Anónimo",
        price: oferta.price,
        prima: ((parseFloat(oferta.price) - precioBTC) / precioBTC * 100).toFixed(2) + '%',
        metodos
      };
    });

    // Obtener IDs ya enviados desde KV
    const idsEnviados = new Set(await kv.smembers(CONFIG.KV_KEY) || []);

    // Filtrar nuevas ofertas
    const nuevasOfertas = ofertasFiltradas.filter(oferta => !idsEnviados.has(oferta.id));

    if (nuevasOfertas.length) {
      await enviarCorreo(ofertasFiltradas);

      // Guardar nuevos IDs en KV
      await kv.sadd(CONFIG.KV_KEY, ...nuevasOfertas.map(o => o.id));

      return res.status(200).send("Correo enviado con nuevas ofertas");
    } else {
      return res.status(200).send("Sin ofertas nuevas.");
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
        "filters[side]": "sell",
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

  return todas;
}
