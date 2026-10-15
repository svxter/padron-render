const $ = id => document.getElementById(id);
const msg = $('mensaje');

const campos = ['inventario','descripcion','marca','modelo','serie','material','color','agrupados',
  'organo_superior','unidad_presupuestal','adscripcion','cog','cve_armonizada','patrimoniable'];
const ESTADOS = ['BUENO', 'REGULAR', 'MALO', 'BAJA'];
let bienActual = null;
let abiertaDesdeLista = false;   // true cuando se abre con el botón "Ver ficha"

async function guardarEstado() {
  const sel = $('estatus_contable');
  if (!bienActual) { msg.textContent = 'Primero busca un bien para guardar su estado.'; sel.value = ''; return false; }
  const fd = new FormData();
  fd.append('inv', bienActual.inventario);
  fd.append('estado', sel.value);
  try {
    const r = await fetch('php/guardar_estado.php', { method: 'POST', body: fd });
    if (r.status === 401) { location.href = 'index.html'; return false; }
    const j = await r.json();
    msg.textContent = j.error ? j.error : (sel.value ? 'Estado «' + sel.value + '» guardado.' : 'Estado borrado.');
    return !j.error;
  } catch (e) { msg.textContent = 'No se pudo guardar el estado.'; return false; }
}
$('estatus_contable').addEventListener('change', guardarEstado);

// ----- Ventanita en el centro de la pantalla -----
function mostrarAlerta(texto) {
  return new Promise(resolve => {
    const fondo = document.createElement('div');
    fondo.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;z-index:9999;';
    const caja = document.createElement('div');
    caja.style.cssText = 'background:#fff;padding:26px 30px;border-radius:8px;border-top:5px solid #8a2a45;max-width:360px;width:90%;text-align:center;font-family:Arial,Helvetica,sans-serif;box-shadow:0 8px 30px rgba(0,0,0,.3);';
    caja.innerHTML = '<p style="margin:0 0 18px;font-size:16px;color:#222"></p>' +
      '<button style="padding:9px 22px;font-size:15px;border:0;border-radius:5px;background:#8a2a45;color:#fff;cursor:pointer">Entendido</button>';
    caja.querySelector('p').textContent = texto;
    const btn = caja.querySelector('button');
    btn.onclick = () => { fondo.remove(); resolve(); };
    fondo.appendChild(caja);
    document.body.appendChild(fondo);
    btn.focus();
  });
}

// Revisa que haya un bien cargado y un estado elegido
async function validarFicha() {
  if (!bienActual) { await mostrarAlerta('Primero busca un bien.'); return false; }
  const sel = $('estatus_contable');
  if (!sel.value) {
    await mostrarAlerta('Te falta seleccionar el estado del bien (Estatus contable).');
    sel.focus();
    return false;
  }
  return true;
}

function vaciar() {
  campos.concat(['ubicacion', 'fecha', 'monto']).forEach(c => $('f_' + c).textContent = '');
  $('estatus_contable').value = '';
}

// ----- Fotos del bien: se guardan en el servidor por número de inventario -----
const cajasFoto = [...document.querySelectorAll('[data-foto]')];   // 1 = etiqueta, 2 = frente, 3 = costado

function ponerFoto(n, url) {
  const box = cajasFoto[n - 1].closest('.foto');
  box.querySelector('img')?.remove();
  if (url) { const img = new Image(); img.src = url; box.appendChild(img); }
}

// Reduce la foto a 1200 px para que no llene el espacio del hosting
function reducir(file, max = 1200) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const f = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * f);
      c.height = Math.round(img.height * f);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      c.toBlob(b => b ? resolve(b) : reject(), 'image/jpeg', 0.85);
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

// Al elegir una foto: se ve al instante y se guarda en el servidor
cajasFoto.forEach((inp, i) => {
  inp.addEventListener('change', async () => {
    const f = inp.files[0]; if (!f) return;
    if (!bienActual) {
      msg.textContent = 'Primero busca el bien para guardar sus fotos.';
      inp.value = '';
      return;
    }
    try {
      const blob = await reducir(f);
      ponerFoto(i + 1, URL.createObjectURL(blob));
      const fd = new FormData();
      fd.append('inv', bienActual.inventario);
      fd.append('slot', i + 1);
      fd.append('foto', blob, 'foto.jpg');
      const r = await fetch('php/fotos_bien.php', { method: 'POST', body: fd });
      if (r.status === 401) { location.href = 'index.html'; return; }
      const j = await r.json();
      msg.textContent = j.error ? j.error : 'Foto ' + (i + 1) + ' guardada.';
    } catch (e) { msg.textContent = 'No se pudo guardar la foto.'; }
    inp.value = '';
  });
});

// Al abrir un bien: trae sus fotos guardadas (y las fotos modelo si faltan frente o costado)
async function cargarFotos(b) {
  [1, 2, 3].forEach(n => ponerFoto(n, null));
  try {
    const r = await fetch('php/fotos_bien.php?inv=' + encodeURIComponent(b.inventario));
    const f = await r.json();
    [1, 2, 3].forEach(n => { if (f[n]) ponerFoto(n, f[n]); });
    if (!f[2] || !f[3]) {
      const m = await (await fetch('php/fotos_modelo.php?descripcion=' + encodeURIComponent(b.descripcion))).json();
      if (m) {
        if (!f[2]) ponerFoto(2, m.frente);
        if (!f[3]) ponerFoto(3, m.costado);
      }
    }
  } catch (e) {}
}

// Función para mostrar el modal centrado
function mostrarModalConfirmacion() {
  return new Promise((resolve) => {
    const modal = $('modalInventario');
    const btnAceptar = $('modalBtnAceptar');
    const btnCancelar = $('modalBtnCancelar');

    modal.style.display = 'flex';

    function limpiarEventos() {
      btnAceptar.onclick = null;
      btnCancelar.onclick = null;
      modal.style.display = 'none';
    }

    btnAceptar.onclick = () => {
      limpiarEventos();
      resolve(true); // Sí, crear otra ficha
    };

    btnCancelar.onclick = () => {
      limpiarEventos();
      resolve(false); // No, cancelar
    };
  });
}

async function buscar() {
  const inv = $('inv').value.trim();
  msg.textContent = '';
  if (!inv) { msg.textContent = 'Escribe un número de inventario.'; return; }

  try {
    const r = await fetch('php/buscar.php?inv=' + encodeURIComponent(inv));
    if (r.status === 401) { location.href = 'index.html'; return; }
    const b = await r.json();

    if (b.error) {
      vaciar();
      bienActual = null;
      [1, 2, 3].forEach(n => ponerFoto(n, null));
      msg.textContent = b.error;
      return;
    }

    // --- VALIDACIÓN CON LOCALSTORAGE ---
    // Si se abre desde la lista por estado, se salta esta validación
    if (!abiertaDesdeLista) {
      let fichasCreadas = JSON.parse(localStorage.getItem('fichas_creadas')) || [];

      if (fichasCreadas.includes(inv)) {
        const deseaCrearOtra = await mostrarModalConfirmacion();

        if (!deseaCrearOtra) {
          msg.textContent = "Mostrando ficha existente.";
        } else {
          msg.textContent = "Modo de nueva ficha para inventario ya registrado.";
        }
      } else {
        fichasCreadas.push(inv);
        localStorage.setItem('fichas_creadas', JSON.stringify(fichasCreadas));
        msg.textContent = "Nueva ficha generada.";
      }
    }

    // Llenado de campos
    campos.forEach(c => $('f_' + c).textContent = b[c] ?? '');
    if (!b.organo_superior) $('f_organo_superior').textContent = 'Secretaría de Bienestar e Inclusión Social';
    $('f_ubicacion').textContent = [b.edificio, b.nivel, b.local].filter(Boolean).join(' / ') || 'Centro Minero';
    $('f_fecha').textContent = b.fecha ? b.fecha.split('-').reverse().join('/') : '';
    $('f_monto').textContent = b.monto
      ? Number(b.monto).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' }) : '';

    // Recordar el bien, mostrar su estado guardado y traer sus fotos
    bienActual = b;
    cargarFotos(b);
    $('estatus_contable').value = ESTADOS.includes(b.estado_bien) ? b.estado_bien : '';

  } catch (e) {
    msg.textContent = 'No se pudo consultar. Revisa que Apache y MySQL estén encendidos.';
  }
}

$('btnBuscar').onclick = buscar;
$('inv').addEventListener('keydown', e => { if (e.key === 'Enter') buscar(); });

// ----- Imprimir: antes revisa que esté elegido el estado -----
$('btnImprimir').onclick = async () => {
  if (!(await validarFicha())) return;
  window.print();
};

// ----- Guardar: guarda el estado en el sistema y el PDF de la ficha -----
// Convierte la ficha en un PDF (hoja carta horizontal)
async function generarPDF() {
  if (typeof html2canvas === 'undefined' || !window.jspdf) {
    throw new Error('No se pudieron cargar las herramientas del PDF (¿sin internet?).');
  }
  const canvas = await html2canvas(document.querySelector('.hoja'), {
    scale: 2,
    backgroundColor: '#ffffff',
    useCORS: true,
    onclone: doc => {
      // El menú del estatus se muestra como texto y se ocultan los letreros de cajas vacías
      const s = doc.getElementById('estatus_contable');
      if (s) { const t = doc.createElement('span'); t.textContent = s.value; s.replaceWith(t); }
      doc.querySelectorAll('.foto span.vacio').forEach(e => e.style.visibility = 'hidden');
    }
  });
  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'letter' });
  const margen = 8;
  const maxW = pdf.internal.pageSize.getWidth() - margen * 2;
  const maxH = pdf.internal.pageSize.getHeight() - margen * 2;
  const k = Math.min(maxW / canvas.width, maxH / canvas.height);
  const w = canvas.width * k, h = canvas.height * k;
  pdf.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', (pdf.internal.pageSize.getWidth() - w) / 2, margen, w, h);
  return pdf.output('blob');
}

// Ventana "Guardar como" (Chrome, Edge, Opera). En otros navegadores se descarga directo.
async function guardarComo(blob, nombre) {
  if (window.showSaveFilePicker) {
    try {
      const h = await window.showSaveFilePicker({
        suggestedName: nombre,
        types: [{ description: 'PDF', accept: { 'application/pdf': ['.pdf'] } }]
      });
      const w = await h.createWritable();
      await w.write(blob);
      await w.close();
      return true;
    } catch (e) {
      if (e.name === 'AbortError') return false;   // el usuario canceló
    }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = nombre;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  return true;
}

$('btnGuardar').onclick = async () => {
  if (!(await validarFicha())) return;
  if (!(await guardarEstado())) return;
  msg.textContent = 'Preparando el PDF…';
  try {
    const blob = await generarPDF();
    const nombre = 'Ficha_' + bienActual.inventario.replace(/[^A-Za-z0-9_-]/g, '_') + '.pdf';
    const guardado = await guardarComo(blob, nombre);
    const fotos = document.querySelectorAll('.foto img').length;
    msg.textContent = guardado
      ? 'Ficha guardada en el sistema y PDF guardado.' + (fotos < 3 ? ' Ojo: faltan ' + (3 - fotos) + ' foto(s).' : '')
      : 'Estado guardado en el sistema. Se canceló el guardado del PDF.';
  } catch (e) {
    msg.textContent = e.message || 'No se pudo crear el PDF.';
  }
};

// Nueva ficha: limpia la pantalla (no borra nada del servidor)
$('btnLimpiar').onclick = () => {
  vaciar();
  bienActual = null;
  $('inv').value = '';
  $('estatus_contable').value = '';
  document.querySelectorAll('.foto img').forEach(i => i.remove());
  document.querySelectorAll('[data-foto]').forEach(i => i.value = '');
  msg.textContent = '';
  $('inv').focus();
};

// Si se abre con ?inv=NUMERO (botón "Ver ficha" de la lista por estado), carga ese bien
const invUrl = new URLSearchParams(location.search).get('inv');
if (invUrl) {
  $('inv').value = invUrl;
  abiertaDesdeLista = true;
  buscar().finally(() => { abiertaDesdeLista = false; });
}