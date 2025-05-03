const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const nodemailer = require('nodemailer');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// URL de HodlHodl
const URL = process.env.url_hold;

// Archivo para guardar las ofertas ya notificadas
const FILE_NOTIFICADAS = 'notificadas.json';

let ofertasNotificadas = [];
if (fs.existsSync(FILE_NOTIFICADAS)) {
  ofertasNotificadas = JSON.parse(fs.readFileSync(FILE_NOTIFICADAS));
}

// Configuración del correo
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
     user: process.env.mail_gmail, // Cambiado de tu correo
     pass: process.env.pass_gmail  // Cambiado de tu contraseña de aplicación
  }
});

// Función para enviar correo
async function enviarCorreo(oferta) {
  await transporter.sendMail({
    from: '"Monitor HodlHodl" <process.env.mail_gmail>',
    to: "process.env.mail_hotmail",
    subject: "⚡ Nueva oferta HodlHodl encontrada",
    text: oferta
  });
  console.log("📧 Correo enviado");
}

// Función para buscar ofertas
async function buscarOfertas() {
  try {
    const https = require('https');

// Crear un agente HTTPS que force el uso de TLS 1.2 o superior
const agent = new https.Agent({
  secureProtocol: 'TLS_method'  // Forzar uso de TLS 1.2 o superior
});
    const { data: html } = await axios.get(URL, { httpsAgent: agent });
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
  } catch (err) {
    console.error("❌ Error buscando ofertas:", err.message);
  }
}

// Ejecutar cada 5 minutos
buscarOfertas();
setInterval(buscarOfertas, 5 * 60 * 1000);

// Ruta para mantener Glitch activo
app.get("/", (req, res) => {
  res.send("✅ Monitor HodlHodl activo en Glitch.");
});

app.listen(PORT, () => {
  console.log(`🌐 Servidor escuchando en http://localhost:${PORT}`);
});
