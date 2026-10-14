# Padrón · Fichas técnicas de bienes

Sistema web en PHP para consultar el padrón de bienes, registrar su estado (Bueno, Regular, Malo, Inservible)
y guardar fotos modelo por tipo de bien. Base de datos: **PostgreSQL en Neon**. Hosting: **Render (Docker)**.

## Despliegue

1. **Base de datos (Neon)** — en el SQL Editor ejecuta en orden los archivos de `inventario_neon/`
   (`01-esquema.sql` … `14-otras-tablas-y-comprobacion.sql`).
2. **Repositorio** — sube esta carpeta a GitHub.
3. **Render** — *New → Web Service* → conecta el repositorio:
   - Language / Runtime: **Docker**
   - Instance type: Free
   - **Environment → Add Environment Variable**
     `DATABASE_URL` = cadena de conexión de Neon (*Dashboard → Connect*), por ejemplo
     `postgresql://usuario:clave@ep-xxxx.us-east-2.aws.neon.tech/neondb?sslmode=require`
4. Al terminar el despliegue abre `https://<tu-servicio>.onrender.com/php/diagnostico.php`:
   todo debe salir en ✅. Después entra por `https://<tu-servicio>.onrender.com/`.

La contraseña de la base **nunca** va en el código: solo en la variable `DATABASE_URL` de Render.

## Estructura

| Ruta | Qué hace |
|---|---|
| `index.php` | Inicio de sesión y registro |
| `menu.html`, `padron.html`, `varios.html`, `estados.html` | Pantallas del sistema |
| `php/conexion.php` | Conexión PDO a PostgreSQL usando `DATABASE_URL` |
| `php/autenticar.php`, `php/registrar.php`, `php/logout.php`, `php/sesion.php` | Sesión de usuario |
| `php/buscar.php`, `php/buscar_lista.php` | Consulta de bienes por número de inventario |
| `php/guardar_estado.php`, `php/listar_estados.php` | Estado físico de los bienes |
| `php/fotos_modelo.php`, `php/foto_modelo.php` | Fotos modelo guardadas en la base de datos |
| `php/diagnostico.php` | Comprobación de PHP, extensión y conexión (puede borrarse) |
