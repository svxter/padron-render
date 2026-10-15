<?php
session_start();

function fallo($codigo, $texto) {
    http_response_code($codigo);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['error' => $texto]);
    exit;
}

if (empty($_SESSION['usuario'])) fallo(401, 'Sesión no válida');

require 'conexion.php';

// Carpeta donde se guardan las fotos (se crea sola, en la raíz del proyecto)
$carpeta = dirname(__DIR__) . '/fotos_bienes';
if (!is_dir($carpeta)) { mkdir($carpeta, 0775, true); }
if (!file_exists($carpeta . '/.htaccess')) { @file_put_contents($carpeta . '/.htaccess', "Require all denied\n"); }

function base($inv)  { return preg_replace('/[^A-Za-z0-9_-]/', '_', $inv); }
function archivos($carpeta, $inv, $slot) { return glob($carpeta . '/' . base($inv) . '_' . $slot . '.*') ?: []; }

/* ---- Guardar o borrar una foto ---- */
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $inv    = trim($_POST['inv'] ?? '');
    $slot   = (int) ($_POST['slot'] ?? 0);
    $accion = $_POST['accion'] ?? 'guardar';
    if ($inv === '' || $slot < 1 || $slot > 3) fallo(400, 'Datos incompletos.');

    $pdo = conectar();
    $ck = $pdo->prepare('SELECT 1 FROM bienes WHERE inventario = ?');
    $ck->execute([$inv]);
    if (!$ck->fetch()) fallo(404, 'No existe ese número de inventario.');

    if ($accion === 'borrar') {
        foreach (archivos($carpeta, $inv, $slot) as $v) { @unlink($v); }
        echo json_encode(['ok' => true]);
        exit;
    }

    if (empty($_FILES['foto']) || $_FILES['foto']['error'] !== UPLOAD_ERR_OK) fallo(400, 'No llegó la foto.');
    $f = $_FILES['foto'];
    if ($f['size'] > 8 * 1024 * 1024) fallo(400, 'La foto pesa demasiado.');
    $info  = @getimagesize($f['tmp_name']);
    $tipos = [IMAGETYPE_JPEG => 'jpg', IMAGETYPE_PNG => 'png', IMAGETYPE_WEBP => 'webp'];
    if (!$info || !isset($tipos[$info[2]])) fallo(400, 'El archivo no es una imagen válida.');

    foreach (archivos($carpeta, $inv, $slot) as $v) { @unlink($v); }   // se reemplaza la anterior
    $destino = $carpeta . '/' . base($inv) . '_' . $slot . '.' . $tipos[$info[2]];
    if (!move_uploaded_file($f['tmp_name'], $destino)) fallo(500, 'No se pudo guardar la imagen en el servidor.');
    echo json_encode(['ok' => true]);
    exit;
}

/* ---- Consultar ---- */
$inv = trim($_GET['inv'] ?? '');
if ($inv === '') fallo(400, 'Falta el número de inventario.');

// Con slot: entrega la imagen
if (isset($_GET['slot'])) {
    $slot = (int) $_GET['slot'];
    $f = archivos($carpeta, $inv, $slot)[0] ?? null;
    if (!$f) { http_response_code(404); exit; }
    $info = getimagesize($f);
    header('Content-Type: ' . $info['mime']);
    header('Cache-Control: private, max-age=86400');
    readfile($f);
    exit;
}

// Sin slot: lista qué fotos tiene este bien
$res = [];
foreach ([1, 2, 3] as $s) {
    $f = archivos($carpeta, $inv, $s)[0] ?? null;
    $res[$s] = $f ? 'php/fotos_bien.php?inv=' . rawurlencode($inv) . '&slot=' . $s . '&v=' . filemtime($f) : null;
}
header('Content-Type: application/json; charset=utf-8');
echo json_encode($res);