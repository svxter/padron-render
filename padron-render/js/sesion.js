// Si no hay sesión iniciada, manda al login
fetch('php/sesion.php')
  .then(r => { if (r.status === 401) location.href = 'index.php'; })
  .catch(() => {});
