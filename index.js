const puppeteer = require('puppeteer');
const nodemailer = require('nodemailer');
const fs = require('fs');
const cheerio = require('cheerio');
const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

// URL de HodlHodl
const URL = "https://hodlhodl.com/offers/buy?filters%5Bcurrency_code%5D=EUR&pagination%5Boffset%5D=0";

// Archivo para guardar identificadores ya notificados
const FILE_NOTIFICADAS = 'notificadas.json';

// Cargar IDs ya notificados
let ofertasNotificadas = [];
if (fs.existsSync(FILE_NOTIFICADAS)) {
  ofertasNotificadas = JSON.parse(fs.readFileSync(FILE_NOTIFICADAS));
}

// Configura tu email SMTP
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: 'luismi0003@gmail.com',
    pass: 'isrmilkqvmgwiokh'
  }
});

// Enviar correo
async function enviarCorreo(oferta) {
  let info = await transporter.sendMail({
    from: '"Monitor HodlHodl" <luismi0003@gmail.com>',
    to: "luismi1919@hotmail.com",
    subject: "⚡ Nueva oferta HodlHodl encontrada",
    text: oferta
  });

  console.log("📩 Correo enviado:", info.messageId);
}

// Obtener HTML de la página
async function obtenerDatosPagina() {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  const html = await page.content();
  await browser.close();
  return html;
}

// Lógica principal
async function buscarOfertas() {
  try {
    const html = await obtenerDatosPagina();
    const $ = cheerio.load(html);

    $('tbody[role="rowgroup"] tr').each((i, elem) => {
      const tds = $(elem).find('td');
      if (tds.length > 2) {
        const descuento = $(tds[1]).find('span').eq(1).text().trim();
        const metodosPago = $(tds[3]).find('span');
        const vendedor = $(tds[0]).find('.userLink_userLink__nIn6h').text().trim();

        const metodos = [];
        let tieneMetodoValido = false;

        metodosPago.each((i, span) => {
          const texto = $(span).text().trim();
          metodos.push(texto);
          if (texto.includes('SEPA (EU)') || texto.includes('Revolut')) {
            tieneMetodoValido = true;
          }
        });

        if (descuento.includes("-1%") || tieneMetodoValido) {
          const idOferta = `${vendedor}|${descuento}|${metodos.join(',')}`;

          if (!ofertasNotificadas.includes(idOferta)) {
            console.log("✅ Nueva oferta:", idOferta);

            const textoOferta = `
🔻 Descuento: ${descuento}
👤 Vendedor: ${vendedor}
💳 Métodos de pago: ${metodos.join(', ')}
🔗 Link: ${URL}
            `;
            enviarCorreo(textoOferta);
            ofertasNotificadas.push(idOferta);
            fs.writeFileSync(FILE_NOTIFICADAS, JSON.stringify(ofertasNotificadas, null, 2));
          } else {
            console.log("🟡 Ya notificada:", idOferta);
          }
        }
      }
    });
  } catch (err) {
    console.error("❌ Error:", err.message);
  }
}

// Ejecutar cada 5 minutos
buscarOfertas();
setInterval(buscarOfertas, 5 * 60 * 1000);

// Servidor Express para mantener vivo
app.get("/", (req, res) => {
  res.send("✅ Monitor HodlHodl activo.");
});

app.listen(PORT, () => {
  console.log(`🌐 Servidor escuchando en http://localhost:${PORT}`);
});
