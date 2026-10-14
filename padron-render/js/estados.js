const $ = id => document.getElementById(id);
const ETIQUETAS = { BUENO:'Bueno', REGULAR:'Regular', MALO:'Malo', INSERVIBLE:'Inservible', SIN:'Sin estado' };

let actual = 'BUENO';
let pagina = 1;
let busqueda = '';
let temporizador = null;

function esc(t) {
  return String(t ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
}

async function cargar() {
  try {
    const url = 'php/listar_estados.php?estatus=' + actual + '&pagina=' + pagina + '&q=' + encodeURIComponent(busqueda);
    const r = await fetch(url);
    if (r.status === 401) { location.href = 'index.php'; return; }
    const j = await r.json();
    if (j.error) { $('filas').innerHTML = '<tr><td colspan="3" class="vacio">' + esc(j.error) + '</td></tr>'; return; }

    // Pestañas con su conteo
    $('tabs').innerHTML = Object.keys(ETIQUETAS).map(k =>
      '<button class="tab ' + (k === actual ? 'activa' : '') + '" data-estado="' + k + '">' +
      ETIQUETAS[k] + '<b>' + (j.conteos[k] ?? 0) + '</b></button>').join('');

    // Filas: solo número de inventario, estado y botón para ver la ficha
    $('filas').innerHTML = j.filas.length
      ? j.filas.map(f =>
          '<tr><td>' + esc(f.inventario) + '</td>' +
          '<td><span class="chip ' + (f.estado || 'SIN') + '">' + ETIQUETAS[f.estado || 'SIN'] + '</span></td>' +
          '<td><a class="ver" target="_blank" href="padron.html?inv=' + encodeURIComponent(f.inventario) + '">Ver ficha</a></td></tr>').join('')
      : '<tr><td colspan="3" class="vacio">No hay bienes en este apartado.</td></tr>';

    const paginas = Math.max(1, Math.ceil(j.total / j.por));
    $('info').textContent = j.total + ' bien(es)';
    $('pag').textContent = 'Página ' + j.pagina + ' de ' + paginas;
    $('ant').disabled = j.pagina <= 1;
    $('sig').disabled = j.pagina >= paginas;
  } catch (e) {
    $('filas').innerHTML = '<tr><td colspan="3" class="vacio">No se pudo consultar. Revisa que Apache y MySQL estén encendidos.</td></tr>';
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

cargar();