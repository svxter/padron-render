<?php
// Fotos de cada bien (etiqueta, frente y costado).
// Las imágenes se guardan en Google Drive (a través de un Apps Script) y en Neon solo se
// anota qué archivo de Drive corresponde a cada bien y a cada foto.
session_start();

function fallo($codigo, $texto) {
    http_response_code($codigo);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['error' => $texto]);
    exit;
}

if (empty($_SESSION['usuario'])) fallo(401, 'Sesión no válida');
session_write_close();   // libera la sesión para que las 3 fotos de una ficha se pidan a la vez

require 'conexion.php';
$pdo = conectar();

$pdo->exec("CREATE TABLE IF NOT EXISTS fotos_bien (
    inventario  VARCHAR(30)  NOT NULL,
    slot        SMALLINT     NOT NULL,
    drive_id    VARCHAR(120) NOT NULL,
    tipo        VARCHAR(40)  NOT NULL DEFAULT 'image/jpeg',
    actualizado TIMESTAMPTZ  NOT NULL DEFAULT now(),
    PRIMARY KEY (inventario, slot)
)");

function base($inv) { return preg_replace('/[^A-Za-z0-9_-]/', '_', $inv); }

// Llama al Apps Script. La URL y la clave vienen de variables de entorno de Render.
function apps_script(array $payload, $reintentar = false) {
    $url   = getenv('APPS_SCRIPT_URL');
    $clave = getenv('APPS_SCRIPT_CLAVE');
    if (!$url || !$clave) fallo(500, 'Falta configurar APPS_SCRIPT_URL y APPS_SCRIPT_CLAVE en el servidor.');
    if (!function_exists('curl_init')) fallo(500, 'El servidor no tiene habilitado cURL.');

    $payload['clave'] = $clave;
    $cuerpo = json_encode($payload);
    $intentos = $reintentar ? 2 : 1;

    for ($i = 1; $i <= $intentos; $i++) {
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_POST           => true,
            CURLOPT_POSTFIELDS     => $cuerpo,
            CURLOPT_HTTPHEADER     => ['Content-Type: application/json'],
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_FOLLOWLOCATION => true,   // Apps Script responde con una redirección
            CURLOPT_MAXREDIRS      => 5,
            CURLOPT_CONNECTTIMEOUT => 15,
            CURLOPT_TIMEOUT        => 60,
        ]);
        $resp = curl_exec($ch);
        $http = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $err  = curl_error($ch);
        curl_close($ch);

        $j = json_decode((string) $resp, true);
        if (is_array($j)) return $j;

        error_log("apps_script intento $i: http=$http err=$err resp=" . substr((string) $resp, 0, 200));
        if ($i < $intentos) usleep(500000);
    }
    return ['ok' => false, 'error' => 'El servicio de fotos no respondió.'];
}

/* ---- Guardar o borrar una foto ---- */
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $inv    = trim($_POST['inv'] ?? '');
    $slot   = (int) ($_POST['slot'] ?? 0);
    $accion = $_POST['accion'] ?? 'guardar';
    if ($inv === '' || $slot < 1 || $slot > 3) fallo(400, 'Datos incompletos.');

    $ck = $pdo->prepare('SELECT 1 FROM bienes WHERE inventario = ?');
    $ck->execute([$inv]);
    if (!$ck->fetch()) fallo(404, 'No existe ese número de inventario.');

    // ¿Ya había una foto en ese lugar?
    $st = $pdo->prepare('SELECT drive_id FROM fotos_bien WHERE inventario = ? AND slot = ?');
    $st->execute([$inv, $slot]);
    $anterior = $st->fetchColumn() ?: null;

    if ($accion === 'borrar') {
        if ($anterior) {
            apps_script(['accion' => 'borrar', 'id' => $anterior]);
            $pdo->prepare('DELETE FROM fotos_bien WHERE inventario = ? AND slot = ?')->execute([$inv, $slot]);
        }
        echo json_encode(['ok' => true]);
        exit;
    }

    if (empty($_FILES['foto']) || $_FILES['foto']['error'] !== UPLOAD_ERR_OK) fallo(400, 'No llegó la foto.');
    $f = $_FILES['foto'];
    if ($f['size'] > 8 * 1024 * 1024) fallo(400, 'La foto pesa demasiado.');
    $info  = @getimagesize($f['tmp_name']);
    $tipos = [IMAGETYPE_JPEG => ['image/jpeg', 'jpg'], IMAGETYPE_PNG => ['image/png', 'png'], IMAGETYPE_WEBP => ['image/webp', 'webp']];
    if (!$info || !isset($tipos[$info[2]])) fallo(400, 'El archivo no es una imagen válida.');
    [$mime, $ext] = $tipos[$info[2]];

    // El archivo en Drive se llama con el número de inventario (ej. 204290_1.jpg)
    $r = apps_script([
        'accion'     => 'guardar',
        'imagen'     => base64_encode(file_get_contents($f['tmp_name'])),
        'tipo'       => $mime,
        'nombre'     => base($inv) . '_' . $slot . '.' . $ext,
        'reemplazar' => $anterior,
    ]);
    if (empty($r['ok']) || empty($r['id'])) {
        error_log('fotos_bien guardar: ' . json_encode($r));
        fallo(502, 'No se pudo guardar la foto en Drive.');
    }

    $pdo->prepare('INSERT INTO fotos_bien (inventario, slot, drive_id, tipo, actualizado)
                   VALUES (?, ?, ?, ?, now())
                   ON CONFLICT (inventario, slot) DO UPDATE SET
                     drive_id = EXCLUDED.drive_id, tipo = EXCLUDED.tipo, actualizado = now()')
        ->execute([$inv, $slot, $r['id'], $mime]);

    echo json_encode(['ok' => true]);
    exit;
}

/* ---- Consultar ---- */
$inv = trim($_GET['inv'] ?? '');
if ($inv === '') fallo(400, 'Falta el número de inventario.');

// Con slot: entrega la imagen
if (isset($_GET['slot'])) {
    $slot = (int) $_GET['slot'];
    $st = $pdo->prepare('SELECT drive_id, tipo FROM fotos_bien WHERE inventario = ? AND slot = ?');
    $st->execute([$inv, $slot]);
    $fila = $st->fetch();
    if (!$fila) { http_response_code(404); exit; }

    $r = apps_script(['accion' => 'obtener', 'id' => $fila['drive_id']], true);
    $datos = (!empty($r['ok']) && !empty($r['imagen'])) ? base64_decode($r['imagen'], true) : false;
    if ($datos === false) { http_response_code(502); exit; }

    $tipo = (string) ($r['tipo'] ?? $fila['tipo']);
    if (!preg_match('#^image/(jpeg|png|webp)$#', $tipo)) $tipo = 'image/jpeg';
    header('Content-Type: ' . $tipo);
    header('Content-Length: ' . strlen($datos));
    header('Cache-Control: private, max-age=604800');
    echo $datos;
    exit;
}

// Sin slot: lista qué fotos tiene este bien
$st = $pdo->prepare('SELECT slot, EXTRACT(EPOCH FROM actualizado)::bigint AS v FROM fotos_bien WHERE inventario = ?');
$st->execute([$inv]);
$tiene = [];
foreach ($st->fetchAll() as $f) { $tiene[(int) $f['slot']] = $f['v']; }

$res = [];
foreach ([1, 2, 3] as $s) {
    $res[$s] = isset($tiene[$s])
        ? 'php/fotos_bien.php?inv=' . rawurlencode($inv) . '&slot=' . $s . '&v=' . $tiene[$s]
        : null;
}
header('Content-Type: application/json; charset=utf-8');
echo json_encode($res);