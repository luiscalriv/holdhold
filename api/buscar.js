// /api/buscar.js
import axios from 'axios';
import nodemailer from 'nodemailer';

// CONFIGURACIÓN
const CONFIG = {
  PRIMA_MAXIMA: 1, // % sobre precio mercado
  METODOS_PAGO: ["SEPA", "Revolut"],
  PRECIO_MAXIMO: 100000,
  TIMEOUT: 10000,
  HODLHODL_API_KEY: process.env.HODLHODL_API_KEY // Asegúrate de tener esta variable de entorno
};

// Validar configuración
if (!CONFIG.HODLHODL_API_KEY) {
  throw new Error('Falta la API key de HodlHodl en la configuración');
}
if (!process.env.mail_gmail || !process.env.pass_gmail || !process.env.mail_hotmail) {
  throw new Error('Faltan credenciales de correo en las variables de entorno');
}

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
  try {
    const cuerpo = ofertas.map(oferta => `
💰 Precio: ${oferta.price} €
📉 Prima: ${oferta.prima}
👤 Vendedor: ${oferta.vendedor}
💳 Métodos de pago: ${oferta.metodos.join(', ')}
🔗 Link: https://hodlhodl.com/offers/${oferta.id}
    `).join('\n\n----------------------------\n');

    const info = await transporter.sendMail({
      from: `"Monitor HodlHodl" <${process.env.mail_gmail}>`,
      to: process.env.mail_hotmail,
      subject: `📬 ${ofertas.length} Ofertas HodlHodl disponibles`,
      text: cuerpo
    });

    console.log(`Correo enviado: ${info.messageId}`);
    return true;
  } catch (error) {
    console.error('Error enviando correo:', error);
    throw error;
  }
}

// Función principal del endpoint
export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Método no permitido' });
  }

  try {
    const [precioBTC, ofertas] = await Promise.all([
      obtenerPrecioBTC(),
      obtenerTodasLasOfertas()
    ]);

    console.log(`Precio actual BTC: ${precioBTC} EUR`);
    console.log(`Total ofertas recibidas: ${ofertas.length}`);

    const ofertasFiltradas = ofertas.filter(oferta => {
      try {
        const price = parseFloat(oferta.price);
        if (isNaN(price)) return false;

        const metodos = oferta.payment_methods?.map(pm => pm.name) || [];
        const prima = ((price - precioBTC) / precioBTC) * 100;

        const precioValido = price > 0 && price < CONFIG.PRECIO_MAXIMO;
        const metodoValido = CONFIG.METODOS_PAGO.some(metodo =>
          metodos.some(m => m.includes(metodo))
        );
        const primaValida = prima <= CONFIG.PRIMA_MAXIMA;

        return precioValido && metodoValido && primaValida;
      } catch (error) {
        console.error('Error filtrando oferta:', error);
        return false;
      }
    }).map(oferta => ({
      id: oferta.id,
      vendedor: oferta.trader?.login || oferta.user?.login || "Anónimo",
      price: oferta.price,
      prima: `${((parseFloat(oferta.price) - precioBTC) / precioBTC * 100).toFixed(2)}%`,
      metodos: oferta.payment_methods?.map(pm => pm.name) || []
    }));

    console.log(`Ofertas filtradas: ${ofertasFiltradas.length}`);

    if (ofertasFiltradas.length > 0) {
      await enviarCorreo(ofertasFiltradas);
      return res.status(200).json({ 
        success: true, 
        message: "Correo enviado", 
        ofertas: ofertasFiltradas.length 
      });
    } else {
      return res.status(200).json({ 
        success: true, 
        message: "Sin ofertas relevantes." 
      });
    }
  } catch (error) {
    console.error('Error en el handler:', error);
    return res.status(500).json({
      success: false,
      error: "Error en el servidor",
      details: error.message
    });
  }
}

// Obtener el precio actual del BTC en euros
async function obtenerPrecioBTC() {
  try {
    const { data } = await axios.get('https://api.coingecko.com/api/v3/simple/price', {
      params: { 
        ids: 'bitcoin', 
        vs_currencies: 'eur' 
      },
      timeout: CONFIG.TIMEOUT
    });
    
    if (!data?.bitcoin?.eur) {
      throw new Error('No se pudo obtener el precio del BTC');
    }
    
    return data.bitcoin.eur;
  } catch (error) {
    console.error('Error obteniendo precio BTC:', error);
    throw error;
  }
}

// Obtener todas las ofertas con paginación
async function obtenerTodasLasOfertas() {
  const todas = [];
  const limit = 100;
  let offset = 0;
  let continuar = true;

  try {
    while (continuar) {
      const { data } = await axios.get('https://hodlhodl.com/api/v1/offers', {
        params: {
          'filters[side]': 'sell', // Cambiado de 'buy' a 'sell' ya que buscas comprar BTC (vendido por otros)
          'filters[currency_code]': 'EUR',
          'filters[asset_code]': 'BTC',
          'pagination[limit]': limit,
          'pagination[offset]': offset
        },
        headers: {
          'Authorization': `Bearer ${CONFIG.HODLHODL_API_KEY}`,
          'Content-Type': 'application/json'
        },
        timeout: CONFIG.TIMEOUT
      });

      const ofertas = data.offers || [];
      console.log(`Offset ${offset}: ${ofertas.length} ofertas obtenidas`);

      todas.push(...ofertas);

      if (ofertas.length < limit) {
        continuar = false;
      } else {
        offset += limit;
      }

      // Pequeña pausa para no saturar la API
      if (continuar) {
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    }

    console.log(`Total de ofertas recibidas: ${todas.length}`);
    return todas;
  } catch (error) {
    console.error('Error obteniendo ofertas:', error);
    throw error;
  }
}
