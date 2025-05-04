// /api/buscar.js
import axios from 'axios';
import nodemailer from 'nodemailer';

let ofertasNotificadas = [];

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.CORREO_EMISOR,
    pass: process.env.CORREO_CLAVE_APP
  }
});

async function enviarCorreo(oferta) {
  await transporter.sendMail({
    from: `"Monitor HodlHodl" <${process.env.CORREO_EMISOR}>`,
    to: process.env.CORREO_RECEPTOR,
    subject: "⚡ Nueva oferta HodlHodl encontrada",
    text: oferta
  });
  console.log("📧 Correo enviado");
}

export default async function handler(req, res) {
  const URL = "https://hodlhodl.com/offers/buy?filters%5Bcurrency_code%5D=EUR&pagination%5Boffset%5D=0";

  try {
    const { data: html } = await axios.get(URL);
    const matches = html.match(/"username":"(.*?)".*?"payment_methods":\[(.*?)\].*?"price_margin":"(-?\d+)%"/gs);

    if (!matches) {
      return res.status(200).send("Sin ofertas relevantes");
    }

    for (const m of matches) {
      const username = m.match(/"username":"(.*?)"/)?.[1];
      const margin = m.match(/"price_margin":"(-?\d+)%"/)?.[1];
      const methods = m.match(/"payment_methods":\[(.*?)\]/)?.[1]
        ?.replace(/"/g, '')?.split(',');

      const idOferta = `${username}|${margin}|${methods.join(',')}`;

      const tieneMetodoValido = methods.some(m =>
        m.includes("SEPA (EU)") || m.includes("Revolut")
      );

      if ((margin <= -1 || tieneMetodoValido) && !ofertasNotificadas.includes(idOferta)) {
        const texto = `
🔻 Descuento: ${margin}%
👤 Vendedor: ${username}
💳 Métodos de pago: ${methods.join(', ')}
🔗 Link: ${URL}
        `;

        await enviarCorreo(texto);
        ofertasNotificadas.push(idOferta);
      }
    }

    res.status(200).send("Ofertas analizadas");
  } catch (err) {
    console.error("❌ Error:", err.message);
    res.status(500).send("Error al buscar ofertas");
  }
}
