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

if (!preg_match('/^[A-Za-z0-9._@-]{3,60}$/', $usuario)) {
    responder(false, 'El usuario debe tener de 3 a 60 caracteres: letras, números, punto, guion o @.', 400);
}
if (strlen($clave) < 6) {
    responder(false, 'La contraseña debe tener al menos 6 caracteres.', 400);
}

$pdo = conectar();
try {
    $st = $pdo->prepare('INSERT INTO usuarios (usuario, clave) VALUES (?, ?)');
    $st->execute([$usuario, password_hash($clave, PASSWORD_DEFAULT)]);
} catch (PDOException $e) {
    // 23505 = valor duplicado en PostgreSQL (usuario ya registrado)
    if ($e->getCode() === '23505') responder(false, 'Ese usuario ya existe. Elige otro o inicia sesión.', 409);
    throw $e;
}

// Cuenta creada: entra directo
session_regenerate_id(true);
$_SESSION['usuario'] = $usuario;
responder(true);
