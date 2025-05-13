import axios from 'axios';
import nodemailer from 'nodemailer';
import { createClient } from 'redis';

// Conectar a Redis
const redis = createClient({ url: process.env.REDIS_URL });
await redis.connect();

// CONFIGURACIÓN
const CONFIG = {
  PRIMA_MAXIMA: 1,
  METODOS_PAGO: ["SEPA", "Revolut"],
  TIMEOUT: 10000,
  REDIS_KEY: 'ids_enviados',
  LIMPIAR_ANTIGUOS_DIAS: 7
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

// Obtener el precio actual del BTC en euros desde Binance
async function obtenerPrecioBTC() {
  const { data } = await axios.get('https://api.binance.com/api/v3/ticker/price', {
    params: { symbol: 'BTCEUR' },
    timeout: CONFIG.TIMEOUT
  });
  return parseFloat(data.price);
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

// Endpoint
export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return res.status(405).send('Method Not Allowed');
  }

  console.log(`Ejecutando monitor a las ${new Date().toISOString()}`);

  try {
    const precioBTC = await obtenerPrecioBTC();
    const ofertas = await obtenerTodasLasOfertas();

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

    const ahora = Date.now();
    const limiteMs = CONFIG.LIMPIAR_ANTIGUOS_DIAS * 24 * 60 * 60 * 1000;

    const idsEnviadosJSON = await redis.get(CONFIG.REDIS_KEY);
    const idsEnviados = new Set(JSON.parse(idsEnviadosJSON || '[]'));

    const nuevasOfertas = ofertasFiltradas.filter(o => !idsEnviados.has(o.id));

    if (nuevasOfertas.length) {
      await enviarCorreo(nuevasOfertas);

      const nuevos = nuevasOfertas.map(o => o.id);
      idsEnviados.forEach(id => {
        if ((ahora - parseInt(id.split(":")[1] || ahora)) < limiteMs) {
          nuevos.push(id);
        }
      });

      await redis.set(CONFIG.REDIS_KEY, JSON.stringify(nuevos));
      return res.status(200).send("Correo enviado con nuevas ofertas");
    } else {
      return res.status(200).send("Sin ofertas nuevas.");
    }

  } catch (error) {
    console.error("Error en handler:", error);
    return res.status(500).json({
      success: false,
      error: "Error en el servidor"
    });
  }
}
