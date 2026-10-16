const $ = id => document.getElementById(id);
const ETIQUETAS = { BUENO:'Bueno', REGULAR:'Regular', MALO:'Malo', INSERVIBLE:'Inservible', SIN:'Sin estado' };

let actual = 'BUENO';
let pagina = 1;
let busqueda = '';
let temporizador = null;
let invsPagina = [];             // números de la página que se está viendo
let totalApartado = 0;
let generando = false;
const seleccion = new Set();     // números de inventario seleccionados

function esc(t) {
  return String(t ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
}

function actualizarBarra() {
  $('btnPDF').textContent = 'Descargar PDF (' + seleccion.size + ')';
  $('btnPDF').disabled = generando || seleccion.size === 0;
  $('btnQuitar').disabled = generando || seleccion.size === 0;
  $('btnSelTodos').textContent = 'Seleccionar todos de este apartado (' + totalApartado + ')';
  $('selPagina').checked = invsPagina.length > 0 && invsPagina.every(i => seleccion.has(i));
}

async function cargar() {
  try {
    const url = 'php/listar_estados.php?estatus=' + actual + '&pagina=' + pagina + '&q=' + encodeURIComponent(busqueda);
    const r = await fetch(url);
    if (r.status === 401) { location.href = 'index.html'; return; }
    const j = await r.json();
    if (j.error) { $('filas').innerHTML = '<tr><td colspan="4" class="vacio">' + esc(j.error) + '</td></tr>'; return; }

    $('tabs').innerHTML = Object.keys(ETIQUETAS).map(k =>
      '<button class="tab ' + (k === actual ? 'activa' : '') + '" data-estado="' + k + '">' +
      ETIQUETAS[k] + '<b>' + (j.conteos[k] ?? 0) + '</b></button>').join('');

    invsPagina = j.filas.map(f => String(f.inventario));
    totalApartado = j.total;

    $('filas').innerHTML = j.filas.length
      ? j.filas.map(f =>
          '<tr><td class="col-sel"><input type="checkbox" class="sel" data-inv="' + esc(f.inventario) + '"' +
          (seleccion.has(String(f.inventario)) ? ' checked' : '') + '></td>' +
          '<td>' + esc(f.inventario) + '</td>' +
          '<td><span class="chip ' + (f.estado || 'SIN') + '">' + (ETIQUETAS[f.estado || 'SIN'] || esc(f.estado)) + '</span></td>' +
          '<td><a class="ver" target="_blank" href="padron.html?inv=' + encodeURIComponent(f.inventario) + '">Ver ficha</a></td></tr>').join('')
      : '<tr><td colspan="4" class="vacio">No hay bienes en este apartado.</td></tr>';

    const paginas = Math.max(1, Math.ceil(j.total / j.por));
    $('info').textContent = j.total + ' bien(es)';
    $('pag').textContent = 'Página ' + j.pagina + ' de ' + paginas;
    $('ant').disabled = j.pagina <= 1;
    $('sig').disabled = j.pagina >= paginas;
    actualizarBarra();
  } catch (e) {
    $('filas').innerHTML = '<tr><td colspan="4" class="vacio">No se pudo consultar. Revisa tu conexión.</td></tr>';
  }
}

$('tabs').addEventListener('click', e => {
  const b = e.target.closest('.tab');
  if (!b) return;
  actual = b.dataset.estado;
  pagina = 1;
  cargar();
});
$('ant').onclick = () => { pagina--; cargar(); };
$('sig').onclick = () => { pagina++; cargar(); };
$('buscar').addEventListener('input', e => {
  clearTimeout(temporizador);
  temporizador = setTimeout(() => { busqueda = e.target.value.trim(); pagina = 1; cargar(); }, 300);
});

/* ---------- Selección ---------- */
$('filas').addEventListener('change', e => {
  if (!e.target.classList.contains('sel')) return;
  const inv = e.target.dataset.inv;
  if (e.target.checked) seleccion.add(inv); else seleccion.delete(inv);
  actualizarBarra();
});

$('selPagina').addEventListener('change', e => {
  invsPagina.forEach(i => e.target.checked ? seleccion.add(i) : seleccion.delete(i));
  document.querySelectorAll('.sel').forEach(c => c.checked = e.target.checked);
  actualizarBarra();
});

$('btnSelTodos').onclick = async () => {
  try {
    const r = await fetch('php/listar_estados.php?estatus=' + actual + '&todos=1&q=' + encodeURIComponent(busqueda));
    if (r.status === 401) { location.href = 'index.html'; return; }
    const j = await r.json();
    (j.inventarios || []).forEach(i => seleccion.add(String(i)));
    document.querySelectorAll('.sel').forEach(c => c.checked = seleccion.has(c.dataset.inv));
    actualizarBarra();
  } catch (e) { $('progreso').textContent = 'No se pudo seleccionar todos.'; }
};

$('btnQuitar').onclick = () => {
  seleccion.clear();
  document.querySelectorAll('.sel').forEach(c => c.checked = false);
  actualizarBarra();
};

/* ---------- PDF con varias fichas ---------- */
const fmtFecha = f => f ? f.split('-').reverse().join('/') : '';
const fmtMonto = m => m ? Number(m).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' }) : '';

function cajaFoto(url) {
  return '<div class="foto">' + (url ? '<img src="' + esc(url) + '">' : '') + '</div>';
}

// Toma el encabezado (logo y título) y el bloque de firmas directamente de padron.html,
// para que el PDF quede idéntico a la ficha individual
let plantilla = {
  cabecera: '<h1>FICHA TÉCNICA DE BIEN MUEBLE</h1>',
  firmas: '<div class="firmas"><div class="firma"><b>ELABORÓ</b></div><div class="firma"><b>VALIDÓ</b></div><div class="firma"><b>V.O. B.O.</b></div></div>'
};
let estilosAgregados = [];       // estilos de padron.html que se agregan solo mientras se genera el PDF

function quitarEstilosPlantilla() {
  estilosAgregados.forEach(n => n.remove());
  estilosAgregados = [];
}

async function cargarPlantilla() {
  quitarEstilosPlantilla();
  try {
    const r = await fetch('padron.html');
    const doc = new DOMParser().parseFromString(await r.text(), 'text/html');

    // Estilos de padron.html que esta página todavía no tenga (por ejemplo los de las firmas)
    const esperas = [];
    doc.querySelectorAll('link[rel="stylesheet"]').forEach(l => {
      const href = l.getAttribute('href');
      if (!href || /^https?:/.test(href)) return;
      const yaEsta = [...document.querySelectorAll('link[rel="stylesheet"]')].some(x => x.getAttribute('href') === href);
      if (!yaEsta) {
        const n = document.createElement('link');
        n.rel = 'stylesheet';
        n.href = href;
        esperas.push(new Promise(res => { n.onload = res; n.onerror = res; }));
        document.head.appendChild(n);
        estilosAgregados.push(n);
      }
    });
    const css = [...doc.querySelectorAll('style')].map(s => s.textContent).join('\n');
    if (css) {
      const s = document.createElement('style');
      s.textContent = css;
      document.head.appendChild(s);
      estilosAgregados.push(s);
    }
    await Promise.all(esperas);

    const hoja = doc.querySelector('.hoja');
    if (!hoja) return;

    // Encabezado: todo lo que está antes de la primera tabla (logo y título)
    let cabecera = '';
    for (const el of hoja.children) {
      if (el.matches('table')) break;
      cabecera += el.outerHTML;
    }

    // Firmas: el elemento más pequeño que contiene los tres títulos
    let firmas = null;
    hoja.querySelectorAll('*').forEach(el => {
      const t = el.textContent.toUpperCase();
      if (t.includes('ELABOR') && t.includes('VALID') && t.includes('V.O')) firmas = el;
    });

    plantilla = {
      cabecera: cabecera || plantilla.cabecera,
      firmas: firmas ? firmas.outerHTML : plantilla.firmas
    };
  } catch (e) {}
}

function fichaHTML(b, f) {
  const ubic = [b.edificio, b.nivel, b.local].filter(Boolean).join(' / ') || 'Centro Minero';
  const organo = b.organo_superior || 'Secretaría de Bienestar e Inclusión Social';
  return '<div class="hoja">' +
    plantilla.cabecera +
    '<table class="datos"><tr><th>Número de inventario</th><th>Descripción</th><th>Marca</th><th>Modelo</th><th>Serie</th><th>Material</th><th>Color</th><th>Agrupados</th></tr>' +
    '<tr><td>' + esc(b.inventario) + '</td><td>' + esc(b.descripcion) + '</td><td>' + esc(b.marca) + '</td><td>' + esc(b.modelo) + '</td><td>' + esc(b.serie) + '</td><td>' + esc(b.material) + '</td><td>' + esc(b.color) + '</td><td>' + esc(b.agrupados) + '</td></tr></table>' +
    '<table class="datos"><tr><th>Órgano superior<br>Resguardante actual</th><th>Unidad presupuestal<br>Resguardante actual</th><th>Adscripción</th><th>Ubicación</th></tr>' +
    '<tr><td>' + esc(organo) + '</td><td>' + esc(b.unidad_presupuestal) + '</td><td>' + esc(b.adscripcion) + '</td><td>' + esc(ubic) + '</td></tr></table>' +
    '<table class="datos"><tr><th>Fecha adquisición</th><th>Monto original</th><th>COG</th><th>CVE armonizada</th><th>Resguardo</th><th>Estatus contable</th></tr>' +
    '<tr><td>' + esc(fmtFecha(b.fecha)) + '</td><td>' + esc(fmtMonto(b.monto)) + '</td><td>' + esc(b.cog) + '</td><td>' + esc(b.cve_armonizada) + '</td><td>' + esc(b.patrimoniable) + '</td><td>' + esc(b.estado_bien) + '</td></tr></table>' +
    '<h2>MEMORIA FOTOGRÁFICA</h2>' +
    '<div class="fotos">' + cajaFoto(f[1]) + cajaFoto(f[2]) + cajaFoto(f[3]) + '</div>' +
    plantilla.firmas +
    '</div>';
}

// Fotos propias del bien y, si faltan frente o costado, las fotos modelo de su tipo
async function urlsFotos(b, cache) {
  let f = {};
  try { f = await (await fetch('php/fotos_bien.php?inv=' + encodeURIComponent(b.inventario))).json(); } catch (e) {}
  if (!f[2] || !f[3]) {
    if (!cache.has(b.descripcion)) {
      try { cache.set(b.descripcion, await (await fetch('php/fotos_modelo.php?descripcion=' + encodeURIComponent(b.descripcion))).json()); }
      catch (e) { cache.set(b.descripcion, null); }
    }
    const m = cache.get(b.descripcion);
    if (m) { f[2] = f[2] || m.frente; f[3] = f[3] || m.costado; }
  }
  return f;
}

async function crearPDF(invs, alAvanzar) {
  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'letter' });
  const margen = 8;
  const anchoPag = pdf.internal.pageSize.getWidth(), altoPag = pdf.internal.pageSize.getHeight();
  const contenedor = $('render');
  const cacheModelo = new Map();
  await cargarPlantilla();

  // Datos de todos los bienes, en tandas de 20
  const datos = new Map();
  for (let i = 0; i < invs.length; i += 20) {
    const r = await fetch('php/buscar_lista.php?inv=' + encodeURIComponent(invs.slice(i, i + 20).join(',')));
    if (r.status === 401) { location.href = 'index.html'; return null; }
    const filas = await r.json();
    if (Array.isArray(filas)) filas.forEach(b => datos.set(String(b.inventario).toUpperCase(), b));
  }

  const omitidas = [];
  let paginasHechas = 0, n = 0;
  for (const inv of invs) {
    alAvanzar(++n, invs.length);
    const b = datos.get(String(inv).toUpperCase());
    if (!b) { omitidas.push(inv); continue; }

    const fotos = await urlsFotos(b, cacheModelo);
    contenedor.innerHTML = fichaHTML(b, fotos);
    await Promise.all([...contenedor.querySelectorAll('img')].map(i => i.decode().catch(() => {})));

    const canvas = await html2canvas(contenedor.firstElementChild, { scale: 1.5, backgroundColor: '#ffffff', useCORS: true });
    const k = Math.min((anchoPag - margen * 2) / canvas.width, (altoPag - margen * 2) / canvas.height);
    const w = canvas.width * k, h = canvas.height * k;
    if (paginasHechas > 0) pdf.addPage();
    pdf.addImage(canvas.toDataURL('image/jpeg', 0.85), 'JPEG', (anchoPag - w) / 2, margen, w, h);
    paginasHechas++;
  }
  contenedor.innerHTML = '';
  return { blob: paginasHechas ? pdf.output('blob') : null, omitidas, total: paginasHechas };
}

$('btnPDF').onclick = async () => {
  if (!seleccion.size || generando) return;
  if (typeof html2canvas === 'undefined' || !window.jspdf) {
    $('progreso').textContent = 'No se pudieron cargar las herramientas del PDF (¿sin internet?).';
    return;
  }
  const invs = [...seleccion];
  if (invs.length > 40 && !confirm('Son ' + invs.length + ' fichas. Puede tardar varios minutos y el PDF puede pesar mucho. ¿Continuar?')) return;

  const nombre = 'Fichas_' + invs.length + '_' + new Date().toISOString().slice(0, 10) + '.pdf';

  // La ventana "Guardar como" se abre primero, antes de generar (el navegador exige que sea al pulsar el botón)
  let handle = null;
  if (window.showSaveFilePicker) {
    try {
      handle = await window.showSaveFilePicker({ suggestedName: nombre, types: [{ description: 'PDF', accept: { 'application/pdf': ['.pdf'] } }] });
    } catch (e) {
      if (e.name === 'AbortError') return;      // canceló
      handle = null;
    }
  }

  generando = true;
  actualizarBarra();
  try {
    const res = await crearPDF(invs, (n, t) => { $('progreso').textContent = 'Generando ficha ' + n + ' de ' + t + '…'; });
    if (!res) return;
    if (!res.blob) { $('progreso').textContent = 'No se encontró ninguna de las fichas seleccionadas.'; return; }
    if (handle) {
      const w = await handle.createWritable();
      await w.write(res.blob);
      await w.close();
    } else {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(res.blob);
      a.download = nombre;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    }
    $('progreso').textContent = 'PDF guardado con ' + res.total + ' ficha(s).' +
      (res.omitidas.length ? ' No se encontraron: ' + res.omitidas.join(', ') + '.' : '');
  } catch (e) {
    $('progreso').textContent = e.message || 'No se pudo crear el PDF.';
  } finally {
    quitarEstilosPlantilla();
    generando = false;
    actualizarBarra();
  }
};

cargar();