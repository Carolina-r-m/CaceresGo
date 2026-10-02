<?php
// API principal de CaceresGO para MySQL y PHP.
session_start();
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Headers: Content-Type');
header('Access-Control-Allow-Methods: GET, POST, PUT, PATCH, DELETE, OPTIONS');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

require __DIR__ . '/db.php';

function body(): array {
    return json_decode(file_get_contents('php://input'), true) ?: [];
}

function respond($data, int $status = 200): never {
    http_response_code($status);
    echo json_encode($data, JSON_UNESCAPED_UNICODE);
    exit;
}

function currentUser(): ?array {
    return $_SESSION['user'] ?? null;
}

function requireUser(): array {
    $user = currentUser();
    if (!$user) respond(['error' => 'Debes iniciar sesión'], 401);
    if ($user['status'] === 'blocked') respond(['error' => 'Esta cuenta está bloqueada'], 403);
    return $user;
}

function requireAdmin(): array {
    $user = requireUser();
    if ($user['role'] !== 'admin') respond(['error' => 'No tienes permisos de administrador'], 403);
    return $user;
}

$action = $_GET['action'] ?? '';
$method = $_SERVER['REQUEST_METHOD'];
$data = body();

try {
    if ($action === 'register' && $method === 'POST') {
        $name = trim($data['name'] ?? '');
        $email = strtolower(trim($data['email'] ?? ''));
        $password = $data['password'] ?? '';
        if ($name === '' || !filter_var($email, FILTER_VALIDATE_EMAIL) || strlen($password) < 6) {
            respond(['error' => 'Nombre, correo y contraseña válida son obligatorios'], 422);
        }
        $statement = $db->prepare('INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)');
        try {
            $statement->execute([$name, $email, password_hash($password, PASSWORD_DEFAULT)]);
        } catch (PDOException $error) {
            if ($error->errorInfo[1] === 1062) respond(['error' => 'Ya existe una cuenta con ese correo'], 409);
            throw $error;
        }
        $id = (int) $db->lastInsertId();
        $_SESSION['user'] = ['id' => $id, 'name' => $name, 'email' => $email, 'role' => 'participant', 'status' => 'active'];
        respond(['user' => $_SESSION['user']], 201);
    }

    if ($action === 'login' && $method === 'POST') {
        $email = strtolower(trim($data['email'] ?? ''));
        $statement = $db->prepare('SELECT id, name, email, password_hash, role, status FROM users WHERE email = ?');
        $statement->execute([$email]);
        $user = $statement->fetch();
        if (!$user || !password_verify($data['password'] ?? '', $user['password_hash'])) respond(['error' => 'Correo o contraseña incorrectos'], 401);
        if ($user['status'] === 'blocked') respond(['error' => 'Esta cuenta está bloqueada'], 403);
        unset($user['password_hash']);
        $_SESSION['user'] = $user;
        respond(['user' => $user]);
    }

    if ($action === 'logout' && $method === 'POST') {
        $_SESSION = [];
        session_destroy();
        respond(['ok' => true]);
    }

    if ($action === 'me' && $method === 'GET') respond(['user' => currentUser()]);

    if ($action === 'routes' && $method === 'GET') {
        $statement = $db->query("SELECT id, name, description, duration, points FROM routes WHERE status = 'published' ORDER BY created_at");
        respond(['routes' => $statement->fetchAll()]);
    }

    if ($action === 'stats' && $method === 'GET') {
        $routes = $db->query("SELECT COUNT(*) FROM routes WHERE status = 'published'")->fetchColumn();
        $visits = $db->query('SELECT COUNT(*) FROM visits')->fetchColumn();
        $users = $db->query('SELECT COUNT(*) FROM users')->fetchColumn();
        respond(['routes' => (int) $routes, 'visits' => (int) $visits, 'users' => (int) $users]);
    }

    if ($action === 'validate-visit' && $method === 'POST') {
        $user = requireUser();
        $code = strtoupper(trim($data['qr_code'] ?? ''));
        $statement = $db->prepare('SELECT id, name, route_id, points FROM places WHERE qr_code = ?');
        $statement->execute([$code]);
        $place = $statement->fetch();
        if (!$place) respond(['error' => 'No existe ningún lugar con esa clave'], 404);
        try {
            $statement = $db->prepare('INSERT INTO visits (user_id, route_id, place_id, points) VALUES (?, ?, ?, ?)');
            $statement->execute([$user['id'], $place['route_id'], $place['id'], $place['points']]);
        } catch (PDOException $error) {
            if ($error->errorInfo[1] === 1062) respond(['error' => 'Ya habías validado este lugar'], 409);
            throw $error;
        }
        respond(['place' => $place]);
    }

    if ($action === 'admin-routes' && $method === 'GET') {
        requireAdmin();
        $routes = $db->query('SELECT id, name, description, duration, points, status FROM routes ORDER BY created_at')->fetchAll();
        respond(['routes' => $routes]);
    }

    if ($action === 'admin-route' && in_array($method, ['POST', 'PUT'], true)) {
        $admin = requireAdmin();
        $name = trim($data['name'] ?? '');
        if ($name === '') respond(['error' => 'El nombre es obligatorio'], 422);
        if ($method === 'POST') {
            $statement = $db->prepare('INSERT INTO routes (name, description, duration, points, status, created_by) VALUES (?, ?, ?, ?, ?, ?)');
            $statement->execute([$name, trim($data['description'] ?? ''), trim($data['duration'] ?? ''), (int) ($data['points'] ?? 0), $data['status'] ?? 'published', $admin['id']]);
            respond(['id' => (int) $db->lastInsertId()], 201);
        }
        $statement = $db->prepare('UPDATE routes SET name = ?, description = ?, duration = ?, points = ?, status = ? WHERE id = ?');
        $statement->execute([$name, trim($data['description'] ?? ''), trim($data['duration'] ?? ''), (int) ($data['points'] ?? 0), $data['status'] ?? 'published', (int) ($_GET['id'] ?? 0)]);
        respond(['ok' => true]);
    }

    if ($action === 'admin-route' && $method === 'DELETE') {
        requireAdmin();
        $statement = $db->prepare('DELETE FROM routes WHERE id = ?');
        $statement->execute([(int) ($_GET['id'] ?? 0)]);
        respond(['ok' => true]);
    }

    if ($action === 'admin-places' && $method === 'GET') {
        requireAdmin();
        $statement = $db->prepare('SELECT id, route_id, name, qr_code, points, order_index FROM places WHERE route_id = ? ORDER BY order_index');
        $statement->execute([(int) ($_GET['route_id'] ?? 0)]);
        respond(['places' => $statement->fetchAll()]);
    }

    if ($action === 'admin-place' && in_array($method, ['POST', 'PUT'], true)) {
        requireAdmin();
        $values = [trim($data['name'] ?? ''), strtoupper(trim($data['qr_code'] ?? '')), (int) ($data['points'] ?? 0), (int) ($data['route_id'] ?? 0)];
        if ($method === 'POST') {
            $statement = $db->prepare('INSERT INTO places (name, qr_code, points, route_id, order_index) VALUES (?, ?, ?, ?, ?)');
            $statement->execute([...$values, (int) ($data['order_index'] ?? 0)]);
            respond(['id' => (int) $db->lastInsertId()], 201);
        }
        $statement = $db->prepare('UPDATE places SET name = ?, qr_code = ?, points = ?, route_id = ? WHERE id = ?');
        $statement->execute([...$values, (int) ($_GET['id'] ?? 0)]);
        respond(['ok' => true]);
    }

    if ($action === 'admin-place' && $method === 'DELETE') {
        requireAdmin();
        $statement = $db->prepare('DELETE FROM places WHERE id = ?');
        $statement->execute([(int) ($_GET['id'] ?? 0)]);
        respond(['ok' => true]);
    }

    if ($action === 'admin-users' && $method === 'GET') {
        requireAdmin();
        $users = $db->query('SELECT id, name, email, role, status, created_at FROM users ORDER BY created_at')->fetchAll();
        respond(['users' => $users]);
    }

    if ($action === 'admin-user-status' && $method === 'PATCH') {
        requireAdmin();
        $status = ($data['status'] ?? '') === 'blocked' ? 'blocked' : 'active';
        $statement = $db->prepare('UPDATE users SET status = ? WHERE id = ?');
        $statement->execute([$status, (int) ($_GET['id'] ?? 0)]);
        respond(['ok' => true]);
    }

    if ($action === 'admin-results' && $method === 'GET') {
        requireAdmin();
        $statement = $db->query('SELECT c.points, c.completed_at, u.name AS user_name, r.name AS route_name FROM route_completions c JOIN users u ON u.id = c.user_id JOIN routes r ON r.id = c.route_id ORDER BY c.completed_at DESC');
        respond(['results' => $statement->fetchAll()]);
    }

    respond(['error' => 'Acción no encontrada'], 404);
} catch (Throwable $error) {
    respond(['error' => 'Error interno del servidor'], 500);
}
