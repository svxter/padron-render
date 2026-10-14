<?php
session_start();
header('Content-Type: application/json; charset=utf-8');
require 'conexion.php';

function responder($ok, $error = '', $codigo = 200) {
    http_response_code($codigo);
    echo json_encode(['ok' => $ok, 'error' => $error]);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') responder(false, 'Solicitud no válida.', 405);

$usuario = trim($_POST['usuario'] ?? '');
$clave   = $_POST['clave'] ?? '';
if ($usuario === '' || $clave === '') responder(false, 'Escribe usuario y contraseña.', 400);

$pdo = conectar();
$st = $pdo->prepare('SELECT clave FROM usuarios WHERE usuario = ?');
$st->execute([$usuario]);
$hash = $st->fetchColumn();

if ($hash && password_verify($clave, $hash)) {
    session_regenerate_id(true);
    $_SESSION['usuario'] = $usuario;
    responder(true);
}

sleep(1);
responder(false, 'Usuario o contraseña incorrectos. Si aún no tienes cuenta, pulsa «Crear una».', 401);
