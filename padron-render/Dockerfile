# PHP 8.2 con Apache y el driver de PostgreSQL (para Neon)
FROM php:8.2-apache

# libpq-dev es necesaria para compilar pdo_pgsql
RUN apt-get update \
    && apt-get install -y --no-install-recommends libpq-dev \
    && docker-php-ext-install pdo pdo_pgsql \
    && rm -rf /var/lib/apt/lists/*

# Ajustes de PHP para producción: errores al log (no en la página) y fotos de hasta 8 MB
RUN { \
      echo 'display_errors=Off'; \
      echo 'log_errors=On'; \
      echo 'upload_max_filesize=10M'; \
      echo 'post_max_size=24M'; \
      echo 'memory_limit=256M'; \
    } > /usr/local/etc/php/conf.d/padron.ini

# index.php es la página de inicio
RUN echo 'DirectoryIndex index.php index.html' > /etc/apache2/conf-enabled/directoryindex.conf \
    && a2enmod rewrite

COPY . /var/www/html/
RUN chown -R www-data:www-data /var/www/html && chmod -R 755 /var/www/html

# Render indica el puerto en la variable PORT (por defecto 10000)
ENV PORT=10000
RUN sed -i 's/Listen 80/Listen ${PORT}/' /etc/apache2/ports.conf \
    && sed -i 's/<VirtualHost \*:80>/<VirtualHost *:${PORT}>/' /etc/apache2/sites-available/000-default.conf
EXPOSE 10000
