const $ = id => document.getElementById(id);
const msg = $('mensaje');

const campos = ['inventario','descripcion','marca','modelo','serie','material','color','agrupados',
  'organo_superior','unidad_presupuestal','adscripcion','cog','cve_armonizada','patrimoniable'];

const cajas = { 1: $('caja1'), 2: $('caja2'), 3: $('caja3') };
const fotos = { 1: {}, 2: {}, 3: {} };   // { url, blob, manual }
const ESTADOS = ['BUENO', 'REGULAR', 'MALO', 'INSERVIBLE'];
let bienActual = null;

async function guardarEstado() {
  const sel = $('estatus_contable');
  if (!bienActual) { msg.textContent = 'Primero carga un bien para guardar su estado.'; sel.value = ''; return; }
  const fd = new FormData();
  fd.append('inv', bienActual.inventario);
  fd.append('estado', sel.value);
  try {
    const r = await fetch('php/guardar_estado.php', { method: 'POST', body: fd });
    if (r.status === 401) { location.href = 'index.php'; return; }
    const j = await r.json();
    msg.textContent = j.error ? j.error : (sel.value ? 'Estado «' + sel.value + '» guardado.' : 'Estado borrado.');
  } catch (e) { msg.textContent = 'No se pudo guardar el estado.'; }
}
$('estatus_contable').addEventListener('change', guardarEstado);
let descActual = null;       // tipo de bien cuyas fotos 2 y 3 están en pantalla
let modeloExiste = false;
let etiquetaNueva = false;   // la foto 1 se subió para el bien que se va a cargar
let worker = null;


async function cargarBitmap(file) {
  try { return await createImageBitmap(file, { imageOrientation: 'from-image' }); }
  catch (e) { return await createImageBitmap(file); }
}

function dibujar(bmp, max, filtro) {
  const factor = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * factor);
  c.height = Math.round(bmp.height * factor);
  const ctx = c.getContext('2d');
  if (filtro && 'filter' in ctx) ctx.filter = 'grayscale(1) contrast(1.5)';
  ctx.drawImage(bmp, 0, 0, c.width, c.height);
  return c;
}

const aBlob = (canvas, q = 0.85) => new Promise(res => canvas.toBlob(res, 'image/jpeg', q));

function ponerFoto(n, url, manual, blob) {
  cajas[n].querySelector('img')?.remove();
  fotos[n] = { url, blob: blob || null, manual: !!manual };
  if (url) {
    const img = new Image();
    img.src = url;
    cajas[n].appendChild(img);
  }
  actualizarAcciones();
}

async function fotoManual(n, file) {
  const bmp = await cargarBitmap(file);
  const blob = await aBlob(dibujar(bmp, 1200, false));
  bmp.close?.();
  ponerFoto(n, URL.createObjectURL(blob), true, blob);
}

/* ---------- Llenar la ficha ---------- */
const fmtFecha = f => f ? f.split('-').reverse().join('/') : '';
const fmtMonto = m => m ? Number(m).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' }) : '';

function vaciarCampos() {
  campos.concat(['ubicacion', 'fecha', 'monto']).forEach(c => $('f_' + c).textContent = '');
}

async function rellenar(b) {
  bienActual = b;
   
  if (ESTADOS.includes(b.estado_bien)) $('estatus_contable').value = b.estado_bien;
  else if ($('estatus_contable').value) await guardarEstado();
  campos.forEach(c => $('f_' + c).textContent = b[c] ?? '');
  if (!b.organo_superior) $('f_organo_superior').textContent = 'Secretaría de Bienestar e Inclusión Social';
  $('f_ubicacion').textContent = [b.edificio, b.nivel, b.local].filter(Boolean).join(' / ') || 'Casa del Pueblo';
  $('f_fecha').textContent = fmtFecha(b.fecha);
  $('f_monto').textContent = fmtMonto(b.monto);

  // Si cambia el tipo de bien, se limpian las fotos de frente y costado
  if (b.descripcion !== descActual) {
    descActual = b.descripcion;
    ponerFoto(2, null, false);
    ponerFoto(3, null, false);
  }
  await cargarModelo(b.descripcion);
}

async function cargarModelo(desc) {
  try {
    const r = await fetch('php/fotos_modelo.php?descripcion=' + encodeURIComponent(desc));
    if (r.status === 401) { location.href = 'index.php'; return; }
    const m = await r.json();
    modeloExiste = !!(m && m.frente);
    if (modeloExiste) {
      if (!fotos[2].manual) ponerFoto(2, m.frente, false);
      if (!fotos[3].manual) ponerFoto(3, m.costado, false);
    }
  } catch (e) { modeloExiste = false; }
  actualizarAcciones();
}

/* ---------- Búsqueda por número escrito ---------- */
async function buscar() {
  const inv = $('inv').value.trim();
  msg.textContent = '';
  if (!inv) { msg.textContent = 'Escribe un número de inventario.'; return; }
  try {
    const r = await fetch('php/buscar.php?inv=' + encodeURIComponent(inv));
    if (r.status === 401) { location.href = 'index.php'; return; }
    const b = await r.json();
    if (b.error) { vaciarCampos(); bienActual = null; actualizarAcciones(); msg.textContent = b.error; return; }
    // La foto de etiqueta de otro bien no debe quedarse
    if (etiquetaNueva) etiquetaNueva = false; else ponerFoto(1, null, false);
    await rellenar(b);
  } catch (e) {
    msg.textContent = 'No se pudo consultar. Revisa que Apache y MySQL estén encendidos.';
  }
}
$('btnBuscar').onclick = buscar;
$('inv').addEventListener('keydown', e => { if (e.key === 'Enter') buscar(); });

/* ---------- Lectura del número desde la foto de la etiqueta ---------- */
async function obtenerWorker() {
  if (worker) return worker;
  if (typeof Tesseract === 'undefined') throw new Error('sin-ocr');
  worker = await Tesseract.createWorker('eng');
  await worker.setParameters({
    tessedit_char_whitelist: '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ',
    tessedit_pageseg_mode: Tesseract.PSM.SINGLE_BLOCK
  });
  return worker;
}

function candidatos(texto) {
  const t = texto.toUpperCase().replace(/[^A-Z0-9\s]/g, ' ');
  const tokens = t.match(/[A-Z0-9]{3,10}/g) || [];
  const set = new Set();
  tokens.forEach(tok => {
    if (!/\d/.test(tok)) return;
    set.add(tok);
    set.add(tok.replace(/O/g, '0').replace(/[IL]/g, '1'));
  });
  return [...set].slice(0, 15);
}

async function buscarLista(cands) {
  if (!cands.length) return null;
  const r = await fetch('php/buscar_lista.php?inv=' + encodeURIComponent(cands.join(',')));
  if (r.status === 401) { location.href = 'index.php'; return null; }
  const filas = await r.json();
  if (!Array.isArray(filas)) return null;
  for (const c of cands) {
    const f = filas.find(x => String(x.inventario).toUpperCase() === c.toUpperCase());
    if (f) return f;
  }
  return null;
}

async function subirEtiqueta(file) {
  msg.textContent = 'Leyendo la etiqueta…';
  let bmp, ocrCanvas;
  try {
    bmp = await cargarBitmap(file);
    const blob = await aBlob(dibujar(bmp, 1100, false));
    ponerFoto(1, URL.createObjectURL(blob), true, blob);
    etiquetaNueva = true;
    ocrCanvas = dibujar(bmp, 1600, true);
    bmp.close?.();
  } catch (e) { msg.textContent = 'No se pudo abrir esa foto.'; return; }

  try {
    const w = await obtenerWorker();
    const { data } = await w.recognize(ocrCanvas);
    const cands = candidatos(data.text);
    const bien = await buscarLista(cands);
    if (bien) {
      $('inv').value = bien.inventario;
      etiquetaNueva = false;
      await rellenar(bien);
      msg.textContent = '';
    } else {
      if (cands[0]) $('inv').value = cands[0];
      msg.textContent = cands.length
        ? 'No encontré el número ' + cands[0] + '. Corrígelo en la caja y pulsa Buscar.'
        : 'No pude leer el número. Escríbelo en la caja y pulsa Buscar.';
    }
  } catch (e) {
    msg.textContent = e.message === 'sin-ocr'
      ? 'No se pudo cargar el lector (¿sin internet?). Escribe el número y pulsa Buscar.'
      : 'No se pudo leer la etiqueta. Escribe el número y pulsa Buscar.';
  }
}

$('foto1').addEventListener('change', e => { if (e.target.files[0]) subirEtiqueta(e.target.files[0]); e.target.value = ''; });
$('foto2').addEventListener('change', e => { if (e.target.files[0]) fotoManual(2, e.target.files[0]); e.target.value = ''; });
$('foto3').addEventListener('change', e => { if (e.target.files[0]) fotoManual(3, e.target.files[0]); e.target.value = ''; });

/* ---------- Guardar fotos de frente y costado para el tipo de bien ---------- */
function actualizarAcciones() {
  const zona = $('acciones'), btn = $('btnGuardarModelo'), txt = $('textoModelo');
  if (!bienActual) { zona.style.display = 'none'; return; }
  zona.style.display = 'flex';
  const listas = fotos[2].blob && fotos[3].blob;
  if (listas) {
    txt.textContent = modeloExiste
      ? 'Subiste fotos nuevas de «' + bienActual.descripcion + '».'
      : 'Aún no hay fotos modelo para «' + bienActual.descripcion + '».';
    btn.style.display = 'inline-block';
    btn.textContent = modeloExiste
      ? 'Reemplazar fotos modelo de este tipo de bien'
      : 'Guardar estas fotos para todos los «' + bienActual.descripcion + '»';
  } else {
    btn.style.display = 'none';
    txt.textContent = modeloExiste
      ? 'Fotos de frente y costado cargadas automáticamente para «' + bienActual.descripcion + '».'
      : 'Aún no hay fotos modelo para «' + bienActual.descripcion + '». Sube la de frente y la de costado una vez y guárdalas.';
  }
}

$('btnGuardarModelo').onclick = async () => {
  if (!bienActual || !fotos[2].blob || !fotos[3].blob) return;
  const fd = new FormData();
  fd.append('descripcion', bienActual.descripcion);
  fd.append('frente', fotos[2].blob, 'frente.jpg');
  fd.append('costado', fotos[3].blob, 'costado.jpg');
  msg.textContent = 'Guardando fotos…';
  try {
    const r = await fetch('php/fotos_modelo.php', { method: 'POST', body: fd });
    if (r.status === 401) { location.href = 'index.php'; return; }
    const j = await r.json();
    if (j.error) { msg.textContent = j.error; return; }
    fotos[2].manual = false; fotos[3].manual = false;
    fotos[2].blob = null; fotos[3].blob = null;
    modeloExiste = true;
    msg.textContent = 'Listo: esas fotos se pondrán solas en los demás «' + bienActual.descripcion + '».';
    actualizarAcciones();
  } catch (e) { msg.textContent = 'No se pudieron guardar las fotos.'; }
};

/* ---------- Nueva ficha ---------- */
$('btnLimpiar').onclick = () => {
  vaciarCampos();
  $('inv').value = '';
  $('estatus_contable').value = '';
  bienActual = null; descActual = null; modeloExiste = false; etiquetaNueva = false;
  [1, 2, 3].forEach(n => ponerFoto(n, null, false));
  msg.textContent = '';
  actualizarAcciones();
  $('inv').focus();
};
