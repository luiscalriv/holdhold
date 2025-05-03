const puppeteer = require('puppeteer-core');
const nodemailer = require('nodemailer');
const fs = require('fs');
const cheerio = require('cheerio');  // Asegúrate de incluir cheerio
const express = require('express');  // Añadir Express
const app = express();  // Inicializar app

// Usar el puerto proporcionado por el entorno o 3000 como puerto predeterminado
const PORT = process.env.PORT || 3000;

// URL de HodlHodl
const URL = "https://hodlhodl.com/offers/buy?filters%5Bcurrency_code%5D=EUR&pagination%5Boffset%5D=0";

// Archivo para guardar identificadores ya notificados
const FILE_NOTIFICADAS = 'notificadas.json';

// Cargar IDs ya notificados (si existe el archivo)
let ofertasNotificadas = [];
if (fs.existsSync(FILE_NOTIFICADAS)) {
  ofertasNotificadas = JSON.parse(fs.readFileSync(FILE_NOTIFICADAS));
}

// Configura tu email SMTP aquí
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: 'luismi0003@gmail.com',
    pass: 'isrmilkqvmgwiokh' // <-- Asegúrate de que no tenga espacios raros
  }
});

// Función para mandar el correo
async function enviarCorreo(oferta) {
  let info = await transporter.sendMail({
    from: '"Monitor HodlHodl" <luismi0003@gmail.com>',
    to: "luismi1919@hotmail.com",
    subject: "⚡ Nueva oferta HodlHodl encontrada",
    text: oferta
  });

  console.log("Correo enviado: %s", info.messageId);
}

// Función para obtener el contenido de la página usando Puppeteer
async function obtenerDatosPagina() {
  const browser = await puppeteer.launch({
    headless: true,
    executablePath: '/home/runner/.nix-profile/bin/chromium',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu'
    ]
  });
  const page = await browser.newPage();

  await page.goto(URL, { waitUntil: 'domcontentloaded' });  // Esperamos a que cargue el contenido

  // Obtener el HTML de la página
  const html = await page.content();

  await browser.close();
  return html;
}

// Función principal
async function buscarOfertas() {
  try {
    const html = await obtenerDatosPagina();
    const $ = cheerio.load(html);

    $('tbody[role="rowgroup"] tr').each((i, elem) => {
      // Obtener todos los td dentro del tr
      const tds = $(elem).find('td');

      // Verifica si hay suficientes td
      if (tds.length > 2) {
        // Imprimir los contenidos de todos los tds
        tds.each((index, td) => {
          console.log(`Contenido del td ${index}:`, $(td).html()); // Muestra el contenido de cada td
        });

        // Obtener el descuento
        const descuento = $(tds[1]).find('.priceRow_exchangeRateInfoContainer__IvAyS span').eq(1).text().trim();
        console.log("Descuento encontrado:", descuento);  // Imprime descuento

        // Obtener los métodos de pago
        const metodosPago = $(tds[3]).find('.paymentsRow_paymentsRow__z66iF span');
        console.log("Métodos de pago:", metodosPago.text().trim());  // Imprime métodos de pago

        const metodos = [];
        let tieneMetodoValido = false;

        metodosPago.each((i, span) => {
          const texto = $(span).text().trim();
          metodos.push(texto);
          if (texto.includes('SEPA (EU)') || texto.includes('Revolut')) {
            tieneMetodoValido = true;
          }
        });

        const vendedor = $(tds[0]).find('.userLink_userLink__nIn6h').text().trim(); // nombre del vendedor
        console.log("Vendedor encontrado:", vendedor);

        if ((descuento.includes("-1%") || tieneMetodoValido)) {
          // Crear identificador único de esta oferta
          const idOferta = `${vendedor}|${descuento}|${metodos.join(',')}`;

          // Verificar si ya fue notificada
          if (!ofertasNotificadas.includes(idOferta)) {
            console.log("✅ Nueva oferta encontrada:", idOferta);

            const textoOferta = `
              🔻 Descuento: ${descuento}
              👤 Vendedor: ${vendedor}
              💳 Métodos de pago: ${metodos.join(', ')}
              🔗 Link: ${URL}
            `;

            enviarCorreo(textoOferta);

            // Guardar como ya notificada
            ofertasNotificadas.push(idOferta);
            fs.writeFileSync(FILE_NOTIFICADAS, JSON.stringify(ofertasNotificadas, null, 2));
          } else {
            console.log("🟡 Oferta ya notificada:", idOferta);
          }
        }
      }
    });
  } catch (error) {
    console.error("Error:", error.message);
  }
}

// Ejecutar cada 5 minutos
buscarOfertas(); // Llamada inicial
setInterval(buscarOfertas, 5 * 60 * 1000); // Luego cada 5 minutos

// Mantener el servidor vivo
app.get("/", (req, res) => {
  res.send("✅ Monitor HodlHodl activo.");
});

app.listen(PORT, () => {
  console.log(`🌐 Servidor escuchando en http://0.0.0.0:${PORT}`);
});
