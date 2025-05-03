import axios from 'axios';
import nodemailer from 'nodemailer';
import cheerio from 'cheerio';
import fs from 'fs';

const URL = "https://hodlhodl.com/offers/buy?filters%5Bcurrency_code%5D=EUR&pagination%5Boffset%5D=0";
const FILE_NOTIFICADAS = '/tmp/notificadas.json';  // Vercel usa /tmp para almacenamiento temporal
let ofertasNotificadas = [];

if (fs.existsSync(FILE_NOTIFICADAS)) {
  ofertasNotificadas = JSON.parse(fs.readFileSync(FILE_NOTIFICADAS));
}

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: 'luismi0003@gmail.com',
    pass: 'isrmilkqvmgwiokh'
  }
});

async function enviarCorreo(oferta) {
  await transporter.sendMail({
    from: '"Monitor HodlHodl" <luismi0003@gmail.com>',
    to: "luismi1919@hotmail.com",
    subject: "⚡ Nueva oferta HodlHodl encontrada",
    text: oferta
  });
  console.log("📧 Correo enviado");
}

export default async function handler(req, res) {
  try {
    const { data: html } = await axios.get(URL);
    const $ = cheerio.load(html);

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
        const idOferta = `${vendedor}|${descuento}|${metodosPago.join(",")}`;

        if (!ofertasNotificadas.includes(idOferta)) {
          const textoOferta = `
🔻 Descuento: ${descuento}
👤 Vendedor: ${vendedor}
💳 Métodos de pago: ${metodosPago.join(', ')}
🔗 Link: ${URL}
          `;

          enviarCorreo(textoOferta);
          ofertasNotificadas.push(idOferta);
          fs.writeFileSync(FILE_NOTIFICADAS, JSON.stringify(ofertasNotificadas, null, 2));
          console.log("✅ Nueva oferta notificada:", idOferta);
        } else {
          console.log("🟡 Oferta ya notificada:", idOferta);
        }
      }
    });

    res.status(200).json({ message: 'Ofertas verificadas y notificadas' });

  } catch (err) {
    console.error("❌ Error buscando ofertas:", err.message);
    res.status(500).json({ error: err.message });
  }
}
