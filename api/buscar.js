// /api/buscar.js
import axios from 'axios';
import nodemailer from 'nodemailer';

let ofertasNotificadas = [];

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.mail_gmail,
    pass: process.env.pass_gmail
  }
});

async function enviarCorreo(oferta) {
  await transporter.sendMail({
    from: `"Monitor HodlHodl" <${process.env.mail_gmail}>`,
    to: process.env.mail_hotmail,
    subject: "⚡ Nueva oferta HodlHodl encontrada",
    text: oferta
  });
  console.log("📧 Correo enviado");
}

export default async function handler(req, res) {
  try {
    // Obtener IDs de métodos de pago
    const { data: pmData } = await axios.get('https://hodlhodl.com/api/v1/payment_methods');
    const metodosFiltrados = pmData.payment_methods.filter(pm =>
      ["SEPA (EU)", "Revolut"].includes(pm.name)
    );
    const metodoIDs = metodosFiltrados.map(pm => pm.id);

    if (metodoIDs.length === 0) {
      return res.status(500).send("No se encontraron métodos de pago válidos.");
    }

    // Obtener ofertas
    const { data } = await axios.get('https://hodlhodl.com/api/v1/offers', {
      params: {
        type: 'buy',
        currency_code: 'EUR',
        payment_method_ids: metodoIDs.join(','),
        limit: 20
      }
    });

    const nuevasOfertas = [];

    for (const oferta of data.offers) {
      const vendedor = oferta.user?.login || 'Desconocido';
      const descuento = oferta.price_margin ?? 'N/A';
      const metodos = oferta.payment_methods?.map(pm => pm.name) || [];
      const idOferta = `${oferta.id}|${vendedor}|${descuento}`;

      if (!ofertasNotificadas.includes(idOferta)) {
        const texto = `
🔻 Descuento: ${descuento}%
👤 Vendedor: ${vendedor}
💳 Métodos de pago: ${metodos.join(', ')}
🔗 Link: https://hodlhodl.com/offers/${oferta.id}
        `;
        await enviarCorreo(texto);
        ofertasNotificadas.push(idOferta);
        nuevasOfertas.push(idOferta);
      }
    }

    res.status(200).send(nuevasOfertas.length ? `Se notificaron ${nuevasOfertas.length} ofertas.` : "Sin ofertas relevantes");
  } catch (err) {
    console.error("❌ Error:", err.message);
    res.status(500).send("Error al buscar ofertas");
  }
}
