const axios = require('axios');
const nodemailer = require('nodemailer');
const cron = require('node-cron');
const fs = require('fs');

const API_URL = 'https://hodlhodl.com/api/v1/offers';
const EMAIL_FILE = 'ultimas_ofertas_enviadas.json';
const HORA_ENVIO = '0 8 * * *'; // A las 08:00 AM cada día

// Configura el transporte de correo
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: 'TUCORREO@gmail.com',
    pass: 'TUPASSWORD'
  }
});

async function obtenerTodasLasOfertas(paramsBase) {
  let todas = [];
  let offset = 0;
  const limit = 100;
  let hayMas = true;

  while (hayMas) {
    const params = {
      ...paramsBase,
      'pagination.limit': limit,
      'pagination.offset': offset
    };

    const res = await axios.get(API_URL, { params });
    const ofertas = res.data.offers || [];
    todas = todas.concat(ofertas);

    if (ofertas.length < limit) {
      hayMas = false;
    } else {
      offset += limit;
    }
  }

  return todas;
}

function filtrarOfertas(ofertas, precioBTC, metodoPago) {
  return ofertas.filter(oferta => {
    const metodo = oferta.payment_method_instructions?.[0]?.payment_method_name?.toLowerCase() || '';
    const precio = parseFloat(oferta.price);
    return metodo.includes(metodoPago.toLowerCase()) && precio < precioBTC;
  });
}

function cargarUltimasOfertas() {
  if (fs.existsSync(EMAIL_FILE)) {
    return JSON.parse(fs.readFileSync(EMAIL_FILE));
  }
  return [];
}

function guardarUltimasOfertas(ofertas) {
  fs.writeFileSync(EMAIL_FILE, JSON.stringify(ofertas));
}

function generarContenidoCorreo(ofertas) {
  return ofertas.map(oferta => {
    return `💰 Precio: ${oferta.price} ${oferta.currency_code}\n📍 País: ${oferta.country || 'Global'}\n🔗 Enlace: https://hodlhodl.com/offers/${oferta.id}`;
  }).join('\n\n');
}

async function obtenerPrecioBTC() {
  const res = await axios.get('https://api.coingecko.com/api/v3/simple/price', {
    params: {
      ids: 'bitcoin',
      vs_currencies: 'eur'
    }
  });
  return res.data.bitcoin.eur;
}

async function enviarOfertas() {
  const precioBTC = await obtenerPrecioBTC();
  const ofertas = await obtenerTodasLasOfertas({
    'filters.asset_code': 'BTC',
    'filters.side': 'sell',
    'filters.include_global': true,
    'filters.only_working_now': false,
    'filters.currency_code': 'EUR'
  });

  const ofertasFiltradas = filtrarOfertas(ofertas, precioBTC, 'SEPA');
  const ofertasGuardadas = cargarUltimasOfertas();
  const idsNuevas = ofertasFiltradas.map(o => o.id).filter(id => !ofertasGuardadas.includes(id));
  const nuevasOfertas = ofertasFiltradas.filter(o => idsNuevas.includes(o.id));

  if (nuevasOfertas.length > 0) {
    const contenido = generarContenidoCorreo(nuevasOfertas);
    await transporter.sendMail({
      from: 'TUCORREO@gmail.com',
      to: 'DESTINATARIO@gmail.com',
      subject: '📢 Nuevas ofertas HodlHodl por debajo del mercado',
      text: contenido
    });
    guardarUltimasOfertas(ofertasFiltradas.map(o => o.id));
  }
}

// Programa el envío diario a las 08:00 AM
cron.schedule(HORA_ENVIO, enviarOfertas);

// También puedes ejecutar manualmente
// enviarOfertas();
