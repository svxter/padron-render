<?php
// Entrega la imagen (frente o costado) guardada en la base de datos.
session_start();
if (empty($_SESSION['usuario'])) { http_response_code(401); exit; }

require 'conexion.php';
$lado = ($_GET['lado'] ?? '') === 'costado' ? 'costado' : 'frente';
$desc = trim($_GET['descripcion'] ?? '');

$pdo = conectar();
$st = $pdo->prepare("SELECT $lado AS tipo, {$lado}_img AS img FROM fotos_modelo WHERE descripcion = ?");
$st->execute([$desc]);
$fila = $st->fetch();
if (!$fila || $fila['img'] === null) { http_response_code(404); exit; }

$datos = is_resource($fila['img']) ? stream_get_contents($fila['img']) : $fila['img'];
header('Content-Type: ' . (str_starts_with($fila['tipo'], 'image/') ? $fila['tipo'] : 'image/jpeg'));
header('Cache-Control: private, max-age=31536000'); // la URL cambia (?v=) cuando se actualiza la foto
header('Content-Length: ' . strlen($datos));
echo $datos;
