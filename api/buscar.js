import axios from 'axios';
import nodemailer from 'nodemailer';
import kv from '@vercel/kv';

// CONFIGURACIÓN
const CONFIG = {
  PRIMA_MAXIMA: 1, // % sobre precio mercado
  METODOS_PAGO: ["SEPA", "Revolut"],
  TIMEOUT: 10000,
  KV_KEY: 'ids_enviados',
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

  try {
    await transporter.sendMail({
      from: `"Monitor HodlHodl" <${process.env.mail_gmail}>`,
      to: process.env.mail_hotmail,
      subject: "📬 Ofertas HodlHodl disponibles",
      text: cuerpo
    });
    console.log("Correo enviado con éxito.");
  } catch (error) {
    console.error("Error al enviar correo:", error.message);
    throw new Error("No se pudo enviar el correo.");
  }
}

// Función principal del endpoint
export default async function handler(req, res) {
  try {
    console.log("Obteniendo precio de BTC...");
    const precioBTC = await obtenerPrecioBTC();
    console.log("Obteniendo ofertas...");
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
      } catch (error) {
        console.error("Error al filtrar oferta:", error.message);
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

    // Limpiar IDs antiguos del KV
    const ahora = Date.now();
    const limiteMs = CONFIG.LIMPIAR_ANTIGUOS_DIAS * 24 * 60 * 60 * 1000;
    console.log("Limpiando IDs antiguos del KV...");
    await kv.zremrangebyscore(CONFIG.KV_KEY, 0, ahora - limiteMs);

    // Obtener IDs ya enviados
    console.log("Obteniendo IDs enviados...");
    const idsEnviados = new Set(await kv.zrange(CONFIG.KV_KEY, 0, -1));
    console.log("IDs enviados:", idsEnviados);

    // Detectar nuevas ofertas
    const nuevasOfertas = ofertasFiltradas.filter(o => !idsEnviados.has(o.id));

    if (nuevasOfertas.length) {
      console.log("Enviando correo con nuevas ofertas...");
      await enviarCorreo(nuevasOfertas);

      // Añadir nuevos IDs al KV
      const nuevos = nuevasOfertas.map(o => ({ score: ahora, member: o.id }));
      console.log("Añadiendo nuevos IDs al KV...");
      await kv.zadd(CONFIG.KV_KEY, ...nuevos);

      return res.status(200).send("Correo enviado con nuevas ofertas");
    } else {
      console.log("No hay nuevas ofertas.");
      return res.status(200).send("Sin ofertas nuevas.");
    }

  } catch (error) {
    console.error("Error en handler:", error.message);
    return res.status(500).json({
      success: false,
      error: `Error en el servidor: ${error.message}`
    });
  }
}

// Obtener el precio actual del BTC en euros
async function obtenerPrecioBTC() {
  try {
    const { data } = await axios.get('https://api.coingecko.com/api/v3/simple/price', {
      params: { ids: 'bitcoin', vs_currencies: 'eur' },
      timeout: CONFIG.TIMEOUT
    });
    console.log("Precio de BTC obtenido:", data.bitcoin.eur);
    return data.bitcoin.eur;
  } catch (error) {
    console.error("Error al obtener el precio de BTC:", error.message);
    throw new Error("No se pudo obtener el precio de BTC.");
  }
}

// Obtener todas las ofertas con paginación
async function obtenerTodasLasOfertas() {
  const todas = [];
  const limit = 100;
  let offset = 0;
  let continuar = true;

  while (continuar) {
    try {
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
    } catch (error) {
      console.error("Error al obtener ofertas:", error.message);
      throw new Error("No se pudieron obtener todas las ofertas.");
    }
  }

  return todas;
}
