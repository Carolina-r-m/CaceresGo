-- CaceresGO - esquema MySQL
-- Crear una base de datos llamada caceresgo y ejecutar este archivo.

CREATE DATABASE IF NOT EXISTS caceresgo
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE caceresgo;

CREATE TABLE IF NOT EXISTS users (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  email VARCHAR(190) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('participant', 'admin') NOT NULL DEFAULT 'participant',
  status ENUM('active', 'blocked') NOT NULL DEFAULT 'active',
  birth_date DATE NULL,
  city VARCHAR(120) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS routes (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(180) NOT NULL,
  description TEXT NULL,
  duration VARCHAR(40) NOT NULL,
  points INT UNSIGNED NOT NULL DEFAULT 0,
  status ENUM('draft', 'published', 'archived') NOT NULL DEFAULT 'published',
  created_by INT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_routes_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS places (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  route_id INT UNSIGNED NOT NULL,
  name VARCHAR(180) NOT NULL,
  description TEXT NULL,
  qr_code VARCHAR(80) NOT NULL UNIQUE,
  points INT UNSIGNED NOT NULL DEFAULT 0,
  latitude DECIMAL(10,7) NULL,
  longitude DECIMAL(10,7) NULL,
  order_index INT UNSIGNED NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_places_route FOREIGN KEY (route_id) REFERENCES routes(id) ON DELETE CASCADE,
  INDEX idx_places_route (route_id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS visits (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id INT UNSIGNED NOT NULL,
  route_id INT UNSIGNED NOT NULL,
  place_id INT UNSIGNED NOT NULL,
  points INT UNSIGNED NOT NULL DEFAULT 0,
  validated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_visits_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_visits_route FOREIGN KEY (route_id) REFERENCES routes(id) ON DELETE CASCADE,
  CONSTRAINT fk_visits_place FOREIGN KEY (place_id) REFERENCES places(id) ON DELETE CASCADE,
  UNIQUE KEY uq_user_place (user_id, place_id),
  INDEX idx_visits_route (route_id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS route_completions (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id INT UNSIGNED NOT NULL,
  route_id INT UNSIGNED NOT NULL,
  points INT UNSIGNED NOT NULL DEFAULT 0,
  completed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_completions_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_completions_route FOREIGN KEY (route_id) REFERENCES routes(id) ON DELETE CASCADE,
  UNIQUE KEY uq_user_route (user_id, route_id),
  INDEX idx_completions_route (route_id)
) ENGINE=InnoDB;

INSERT INTO routes (name, description, duration, points, status)
SELECT 'Secretos de la Ciudad Monumental', 'Descubre los rincones imprescindibles de la ciudad monumental.', '90 min', 350, 'published'
WHERE NOT EXISTS (SELECT 1 FROM routes WHERE name = 'Secretos de la Ciudad Monumental');

INSERT INTO routes (name, description, duration, points, status)
SELECT 'Cáceres de leyenda', 'Historias y leyendas para recorrer Cáceres de otra manera.', '60 min', 280, 'published'
WHERE NOT EXISTS (SELECT 1 FROM routes WHERE name = 'Cáceres de leyenda');

INSERT INTO routes (name, description, duration, points, status)
SELECT 'Pequeños exploradores', 'Una aventura familiar para descubrir la ciudad jugando.', '45 min', 180, 'published'
WHERE NOT EXISTS (SELECT 1 FROM routes WHERE name = 'Pequeños exploradores');
