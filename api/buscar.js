// /api/buscar.js
import axios from 'axios';
import * as cheerio from 'cheerio'
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
  const URL = "https://hodlhodl.com/offers/buy?filters%5Bcurrency_code%5D=EUR&pagination%5Boffset%5D=0";

  try {
    const { data: html } = await axios.get(URL, {
      headers: {
        'User-Agent': 'Mozilla/5.0'
      }
    });
console.log(html.slice(0, 2000));
    const $ = cheerio.load(html);
    const resultados = [];

    $('tbody[role="rowgroup"] tr').each((i, elem) => {
      const tds = $(elem).find('td');
      if (tds.length < 4) return;

      const descuento = $(tds[1]).find('span').eq(1).text().trim();
      const vendedor = $(tds[0]).find('.userLink_userLink__nIn6h').text().trim();
      const metodosPago = $(tds[3]).find('span').map((i, el) => $(el).text().trim()).get();

      const tieneMetodoValido = metodosPago.some(m =>
        m.includes("SEPA (EU)") || m.includes("Revolut")
      );

      if ((descuento.includes("-1%") || tieneMetodoValido) && vendedor) {
        resultados.push({
          descuento,
          vendedor,
          metodosPago
        });
      }
    });

    for (const oferta of resultados) {
      const idOferta = `${oferta.vendedor}|${oferta.descuento}|${oferta.metodosPago.join(',')}`;

      if (!ofertasNotificadas.includes(idOferta)) {
        const texto = `
🔻 Descuento: ${oferta.descuento}
👤 Vendedor: ${oferta.vendedor}
💳 Métodos de pago: ${oferta.metodosPago.join(', ')}
🔗 Link: ${URL}
        `;
        await enviarCorreo(texto);
        ofertasNotificadas.push(idOferta);
      }
    }

    res.status(200).send(resultados.length ? "Ofertas analizadas" : "Sin ofertas relevantes");
  } catch (err) {
    console.error("❌ Error:", err.message);
    res.status(500).send("Error al buscar ofertas");
  }
}
