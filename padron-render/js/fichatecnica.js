const $ = id => document.getElementById(id);
const msg = $('mensaje');

const campos = ['inventario','descripcion','marca','modelo','serie','material','color','agrupados',
  'organo_superior','unidad_presupuestal','adscripcion','cog','cve_armonizada','patrimoniable'];
const ESTADOS = ['BUENO', 'REGULAR', 'MALO', 'INSERVIBLE'];
let bienActual = null;
let abiertaDesdeLista = false;   // NUEVO: true cuando se abre con el botón "Ver ficha"

async function guardarEstado() {
  const sel = $('estatus_contable');
  if (!bienActual) { msg.textContent = 'Primero busca un bien para guardar su estado.'; sel.value = ''; return; }
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

function vaciar() {
  campos.concat(['ubicacion', 'fecha', 'monto']).forEach(c => $('f_' + c).textContent = '');
  $('estatus_contable').value = '';
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
    if (r.status === 401) { location.href = 'index.php'; return; }
    const b = await r.json();

    if (b.error) {
      vaciar();
      bienActual = null;            // NUEVO
      msg.textContent = b.error;
      return;
    }

    // --- VALIDACIÓN CON LOCALSTORAGE ---
    // NUEVO: si se abre desde la lista por estado, se salta esta validación
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

    // NUEVO: recordar el bien y mostrar su estado guardado
    bienActual = b;
    $('estatus_contable').value = ESTADOS.includes(b.estado_bien) ? b.estado_bien : '';

  } catch (e) {
    msg.textContent = 'No se pudo consultar. Revisa que Apache y MySQL estén encendidos.';
  }
}

$('btnBuscar').onclick = buscar;
$('inv').addEventListener('keydown', e => { if (e.key === 'Enter') buscar(); });

// Vista previa de fotos
document.querySelectorAll('[data-foto]').forEach(inp => {
  inp.addEventListener('change', () => {
    const f = inp.files[0]; if (!f) return;
    const box = inp.closest('.foto');
    box.querySelector('img')?.remove();
    const img = new Image(); img.src = URL.createObjectURL(f);
    box.appendChild(img);
  });
});

// Nueva ficha: limpia todo
$('btnLimpiar').onclick = () => {
  vaciar();
  bienActual = null;                // NUEVO
  $('inv').value = '';
  $('estatus_contable').value = '';
  document.querySelectorAll('.foto img').forEach(i => i.remove());
  document.querySelectorAll('[data-foto]').forEach(i => i.value = '');
  msg.textContent = '';
  $('inv').focus();
};

// NUEVO: si se abre con ?inv=NUMERO (botón "Ver ficha" de la lista por estado), carga ese bien
const invUrl = new URLSearchParams(location.search).get('inv');
if (invUrl) {
  $('inv').value = invUrl;
  abiertaDesdeLista = true;
  buscar().finally(() => { abiertaDesdeLista = false; });
}