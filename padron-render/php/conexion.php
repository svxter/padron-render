<?php
// Conexión a PostgreSQL (Neon).
// La cadena de conexión NO va en el código: se lee de la variable de entorno DATABASE_URL
// (en Render: Environment → DATABASE_URL = postgresql://usuario:clave@host/neondb?sslmode=require)
function conectar() {
    static $pdo = null;
    if ($pdo) return $pdo;

    $url = getenv('DATABASE_URL') ?: ($_ENV['DATABASE_URL'] ?? '');
    if ($url === '') {
        http_response_code(500);
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode(['error' => 'Falta configurar DATABASE_URL en el servidor.']);
        exit;
    }

    $p = parse_url($url);
    parse_str($p['query'] ?? '', $q);
    $dsn = sprintf('pgsql:host=%s;port=%d;dbname=%s;sslmode=%s',
        $p['host'], $p['port'] ?? 5432, ltrim($p['path'] ?? '/neondb', '/'), $q['sslmode'] ?? 'require');

    $pdo = new PDO($dsn, urldecode($p['user'] ?? ''), urldecode($p['pass'] ?? ''), [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    ]);
    $pdo->exec("SET client_encoding TO 'UTF8'");
    return $pdo;
}

// La columna estado_bien ya viene en el script de Neon; esto solo asegura que exista.
function asegurarEstado($pdo) {
    static $hecho = false;
    if ($hecho) return;
    $pdo->exec('ALTER TABLE bienes ADD COLUMN IF NOT EXISTS estado_bien VARCHAR(20)');
    $pdo->exec('CREATE INDEX IF NOT EXISTS idx_estado_bien ON bienes (estado_bien)');
    $hecho = true;
}