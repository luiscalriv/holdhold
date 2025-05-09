// /api/buscar.js
import axios from 'axios';
import nodemailer from 'nodemailer';

// Validar variables de entorno al iniciar
if (!process.env.mail_gmail || !process.env.pass_gmail || !process.env.mail_hotmail) {
  console.error("❌ Faltan variables de entorno requeridas");
  process.exit(1);
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
💰 Precio: ${oferta.price} € (${oferta.descuento} vs mercado)
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
    console.log("📧 Correo con ofertas enviado");
  } catch (error) {
    console.error("❌ Error enviando correo:", error);
    throw error;
  }
}

export default async function handler(req, res) {
  try {
    // 1. Configuración
    const config = {
      porcentajeMaximoPrima: 10,
      metodosDeseados: ["SEPA", "Revolut"],
      precioMaximo: 100000,
      limiteOfertas: 50,
      timeout: 10000 // 10 segundos
    };

    console.log("🔍 Iniciando búsqueda de ofertas...");

    // 2. Obtener precio BTC
    let precioBTC;
    try {
      const { data } = await axios.get('https://api.coingecko.com/api/v3/simple/price', {
        params: { ids: 'bitcoin', vs_currencies: 'eur' },
        timeout: config.timeout
      });
      precioBTC = data.bitcoin.eur;
      console.log("💰 Precio actual BTC:", precioBTC, "EUR");
    } catch (error) {
      console.error("❌ Error obteniendo precio BTC:", error);
      throw new Error("No se pudo obtener el precio de Bitcoin");
    }

    // 3. Obtener ofertas
    let data;
    try {
      const response = await axios.get('https://hodlhodl.com/api/v1/offers', {
        params: {
          type: 'buy',
          currency_code: 'EUR',
          limit: config.limiteOfertas
        },
        timeout: config.timeout
      });
      data = response.data;
      console.log(`📊 ${data.offers?.length || 0} ofertas encontradas`);
    } catch (error) {
      console.error("❌ Error obteniendo ofertas:", error);
      throw new Error("No se pudieron obtener las ofertas");
    }

    // 4. Filtrar ofertas
    const ofertasFiltradas = data.offers.filter(oferta => {
      try {
        const price = parseFloat(oferta.price);
        const metodos = oferta.payment_methods?.map(pm => pm.name) || [];
        const vendedor = oferta.trader?.login || oferta.user?.login || "Anónimo";
        
        // Calcular prima sobre precio de mercado
        const prima = ((price - precioBTC) / precioBTC) * 100;
        const descuento = -prima; // Convertir a descuento

        const cumpleCondiciones = (
          price > 0 &&
          price < config.precioMaximo &&
          prima <= config.porcentajeMaximoPrima &&
          metodos.some(m => 
            config.metodosDeseados.some(d => m.includes(d))
        );

        console.log(`Oferta ${oferta.id}:`, {
          price,
          prima: prima.toFixed(2) + '%',
          metodos,
          vendedor,
          cumple: cumpleCondiciones
        });

        return cumpleCondiciones;
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
        price: oferta.price,
        descuento: prima <= 0 ? 
          `${Math.abs(prima).toFixed(2)}% bajo mercado` : 
          `${prima.toFixed(2)}% sobre mercado`,
        metodos: oferta.payment_methods?.map(pm => pm.name) || []
      };
    });

    console.log(`✅ ${ofertasFiltradas.length} ofertas válidas encontradas`);

    // 5. Manejar resultados
    if (ofertasFiltradas.length > 0) {
      await enviarCorreo(ofertasFiltradas);
      return res.status(200).json({ 
        success: true,
        count: ofertasFiltradas.length,
        ofertas: ofertasFiltradas,
        message: "Ofertas encontradas y notificadas"
      });
    } else {
      console.log("ℹ️ No se encontraron ofertas que cumplan los criterios");
      return res.status(200).json({ 
        success: false,
        message: "No hay ofertas que cumplan los criterios",
        sugerencia: "Prueba ajustar los parámetros de búsqueda"
      });
    }
  } catch (err) {
    console.error("❌ Error en el handler:", err);
    return res.status(500).json({ 
      success: false,
      error: err.message,
      stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });
  }
}
