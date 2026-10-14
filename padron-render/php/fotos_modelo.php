<?php
// Fotos modelo (frente y costado) por tipo de bien.
// Se guardan DENTRO de la base de datos (Neon), porque el disco de Render se borra en cada despliegue.
session_start();
header('Content-Type: application/json; charset=utf-8');

if (empty($_SESSION['usuario'])) {
    http_response_code(401);
    echo json_encode(['error' => 'Sesión no válida']);
    exit;
}

require 'conexion.php';
$pdo = conectar();
asegurarFotos($pdo);

function fallo($codigo, $texto) {
    http_response_code($codigo);
    echo json_encode(['error' => $texto]);
    exit;
}

// Columnas para guardar la imagen; "frente" y "costado" guardan el tipo (image/jpeg, image/png…)
function asegurarFotos($pdo) {
    $pdo->exec('ALTER TABLE fotos_modelo
        ADD COLUMN IF NOT EXISTS frente_img BYTEA,
        ADD COLUMN IF NOT EXISTS costado_img BYTEA');
}

/* ---- Guardar fotos modelo ---- */
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $desc = trim($_POST['descripcion'] ?? '');
    if ($desc === '') fallo(400, 'Falta la descripción del bien.');

    // Solo descripciones que existan en el padrón
    $ck = $pdo->prepare('SELECT 1 FROM bienes WHERE descripcion = ? LIMIT 1');
    $ck->execute([$desc]);
    if (!$ck->fetch()) fallo(400, 'Esa descripción no existe en el padrón.');

    $tipos = [IMAGETYPE_JPEG => 'image/jpeg', IMAGETYPE_PNG => 'image/png', IMAGETYPE_WEBP => 'image/webp'];
    $img = [];
    foreach (['frente', 'costado'] as $lado) {
        if (empty($_FILES[$lado]) || $_FILES[$lado]['error'] !== UPLOAD_ERR_OK) fallo(400, "Falta la foto de $lado.");
        $f = $_FILES[$lado];
        if ($f['size'] > 8 * 1024 * 1024) fallo(400, "La foto de $lado pesa demasiado.");
        $info = @getimagesize($f['tmp_name']);
        if (!$info || !isset($tipos[$info[2]])) fallo(400, "La foto de $lado no es una imagen válida.");
        $img[$lado] = ['tipo' => $tipos[$info[2]], 'datos' => file_get_contents($f['tmp_name'])];
    }

    $st = $pdo->prepare('INSERT INTO fotos_modelo (descripcion, frente, costado, frente_img, costado_img, actualizado)
                         VALUES (:d, :ft, :ct, :fi, :ci, now())
                         ON CONFLICT (descripcion) DO UPDATE SET
                           frente = EXCLUDED.frente, costado = EXCLUDED.costado,
                           frente_img = EXCLUDED.frente_img, costado_img = EXCLUDED.costado_img,
                           actualizado = now()');
    $st->bindValue(':d', $desc);
    $st->bindValue(':ft', $img['frente']['tipo']);
    $st->bindValue(':ct', $img['costado']['tipo']);
    $st->bindValue(':fi', $img['frente']['datos'], PDO::PARAM_LOB);
    $st->bindValue(':ci', $img['costado']['datos'], PDO::PARAM_LOB);
    $st->execute();
    echo json_encode(['ok' => true]);
    exit;
}

/* ---- Consultar fotos modelo de un tipo de bien ---- */
$desc = trim($_GET['descripcion'] ?? '');
$st = $pdo->prepare('SELECT EXTRACT(EPOCH FROM actualizado)::bigint AS v
                     FROM fotos_modelo WHERE descripcion = ? AND frente_img IS NOT NULL AND costado_img IS NOT NULL');
$st->execute([$desc]);
$fila = $st->fetch();
if (!$fila) { echo 'null'; exit; }
$d = rawurlencode($desc);
echo json_encode([
    'frente'  => "php/foto_modelo.php?lado=frente&descripcion=$d&v={$fila['v']}",
    'costado' => "php/foto_modelo.php?lado=costado&descripcion=$d&v={$fila['v']}",
]);
