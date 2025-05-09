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
    // 1. Configuración flexible
    const PORCENTAJE_MAXIMO_PRIMA = 10; // Aumentado a 10%
    const metodosDeseados = ["SEPA", "Revolut"]; // Keywords más generales
    const PRECIO_MAXIMO = 100000; // Filtra precios absurdos (BTC=91528€)

    // 2. Obtener ofertas
    const { data } = await axios.get('https://hodlhodl.com/api/v1/offers', {
      params: {
        type: 'buy',
        currency_code: 'EUR',
        limit: 50
      }
    });

    // 3. Filtrar ofertas (condiciones más realistas)
    const ofertasFiltradas = data.offers.filter(oferta => {
      try {
        const price = parseFloat(oferta.price);
        const metodos = oferta.payment_methods?.map(pm => pm.name) || [];
        const vendedor = oferta.trader?.login || oferta.user?.login || "Anónimo";
        
        // Calcular descuento vs mercado (positivo = más barato que mercado)
        const descuento = ((precioBTC - price) / precioBTC) * 100;

        // Debug detallado
        console.log(`Oferta ${oferta.id}:`, {
          price,
          descuento: descuento.toFixed(2) + '%',
          metodos,
          vendedor,
          cumple: price < PRECIO_MAXIMO && 
                 descuento > 0 && // Precio mejor que mercado
                 metodos.some(m => 
                   metodosDeseados.some(d => m.includes(d))
        });

        return (
          price > 0 &&
          price < PRECIO_MAXIMO &&
          descuento > 0 && // Solo ofertas con mejor precio que mercado
          metodos.some(m => 
            metodosDeseados.some(d => m.includes(d))) // Match parcial en métodos
        );
      } catch (e) {
        console.error("Error procesando oferta:", e);
        return false;
      }
    }).map(oferta => {
      const price = parseFloat(oferta.price);
      const descuento = ((precioBTC - price) / precioBTC) * 100;
      
      return {
        id: oferta.id,
        vendedor: oferta.trader?.login || oferta.user?.login || "Anónimo",
        price: oferta.price,
        descuento: descuento.toFixed(2) + '%',
        metodos: oferta.payment_methods?.map(pm => pm.name) || []
      };
    });

    console.log(`✅ ${ofertasFiltradas.length} ofertas válidas:`, ofertasFiltradas);

    if (ofertasFiltradas.length) {
      await enviarCorreo(ofertasFiltradas);
      return res.status(200).json({ 
        success: true,
        count: ofertasFiltradas.length,
        ofertas: ofertasFiltradas 
      });
    } else {
      console.log("ℹ️ Posibles razones:");
      console.log("- No hay ofertas con mejor precio que mercado");
      console.log("- No coinciden los métodos de pago");
      console.log("- Precios fuera de rango realista");
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
