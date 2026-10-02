/* =========================
    BLOQUE DEL MAPA
    ========================= */
const mapElement = document.querySelector("#location-map");
const locateButton = document.querySelector("#locate-me");
const locationStatus = document.querySelector("#location-status");
// Estos elementos controlan el mapa y el estado de geolocalizacion.

// Cambia el texto que aparece encima del mapa cuando se obtiene la ubicación.
function setLocationStatus(message, type = "") {
    locationStatus.textContent = message;
    locationStatus.className = `location-status ${type}`.trim();
}

function showMap(latitude, longitude) {
    // Se calcula un área alrededor de las coordenadas para centrar el mapa.
    const delta = 0.008;
    const bbox = [
        longitude - delta,
        latitude - delta,
        longitude + delta,
        latitude + delta
    ].map((value) => value.toFixed(6)).join("%2C");
    const mapUrl = `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${latitude}%2C${longitude}`;
    mapElement.innerHTML = `<iframe title="Mapa de tu ubicación" loading="eager" src="${mapUrl}"></iframe>`;
}

function locateUser() {
    // La posicion solo se solicita despues de una accion expresa del usuario.
    if (!navigator.geolocation) {
        setLocationStatus("Tu navegador no permite obtener la ubicación.", "error");
        return;
    }
    locateButton.disabled = true;
    setLocationStatus("Permitir ubicación a la página para mostrar tu posición...");
    navigator.geolocation.getCurrentPosition(({ coords }) => {
        const { latitude, longitude } = coords;
        showMap(latitude, longitude);
        setLocationStatus(`Ubicación encontrada: ${latitude.toFixed(5)}, ${longitude.toFixed(5)}`, "success");
        locateButton.disabled = false;
    }, (error) => {
        const message = error.code === 1
            ? "Has denegado el permiso de ubicación. Actívalo desde los ajustes del navegador."
            : "No hemos podido obtener tu ubicación. Inténtalo de nuevo.";
        setLocationStatus(message, "error");
        locateButton.disabled = false;
    }, { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 });
}

showMap(39.4753, -6.3717);
locateButton?.addEventListener("click", locateUser);

/* =========================
    ESTADO DE SESIÓN (Supabase)
    ========================= */
// Fila de la tabla "profiles" de la persona conectada, o null si es invitada.
let currentUser = null;

/* =========================
    BLOQUE DE VENTANAS Y QR
    ========================= */
document.querySelectorAll("[data-open]").forEach((button) => {
    // Abre el dialogo para iniciar una validacion.
    button.addEventListener("click", () => document.querySelector("#modal").classList.add("open"));
});

document.querySelectorAll("[data-close]").forEach((button) => {
    // Todos los botones de cierre funcionan para cualquier modal.
    button.addEventListener("click", () => button.closest(".modal").classList.remove("open"));
});

const progressCard = document.querySelector(".progress-card");
const routeScanButton = document.createElement("button");
routeScanButton.className = "primary scan-route-button";
routeScanButton.type = "button";
routeScanButton.textContent = "Leer QR de una ruta";
progressCard?.append(routeScanButton);
// El lector se inserta solo cuando existe la tarjeta de progreso.

const routeModal = document.querySelector("#modal");
const routeModalTitle = document.querySelector("#modal-title");
const routeCode = document.querySelector("#code");
const validateRouteButton = document.querySelector("#validate");
const routeDialog = routeModal?.querySelector(".dialog");
const routeMessage = document.createElement("p");
const qrFileInput = document.createElement("input");
routeMessage.className = "route-message";
qrFileInput.type = "file";
qrFileInput.accept = "image/*";
qrFileInput.capture = "environment";
qrFileInput.hidden = true;
routeDialog?.append(routeMessage, qrFileInput);

routeScanButton.addEventListener("click", () => {
    // En moviles se abre directamente la camara o el selector de imagen.
    routeModalTitle.textContent = "Lee el QR de tu ruta";
    routeMessage.textContent = "Selecciona una foto del QR o escribe la clave de la ruta.";
    routeModal.classList.add("open");
    qrFileInput.click();
});

// Intenta leer una imagen con BarcodeDetector cuando el navegador lo soporta.
qrFileInput.addEventListener("change", async () => {
    const imageFile = qrFileInput.files[0];
    if (!imageFile) return;
    if (!window.BarcodeDetector || !window.createImageBitmap) {
        routeMessage.textContent = "Tu navegador no puede leer la imagen automáticamente. Escribe la clave debajo.";
        return;
    }
    try {
        const detector = new BarcodeDetector({ formats: ["qr_code"] });
        const codes = await detector.detect(await createImageBitmap(imageFile));
        if (codes.length) {
            routeCode.value = codes[0].rawValue;
            routeMessage.textContent = "QR leído correctamente. Pulsa Validar visita.";
        } else {
            routeMessage.textContent = "No se ha encontrado ningún QR en la imagen.";
        }
    } catch {
        routeMessage.textContent = "No se ha podido leer el QR. Prueba con otra imagen.";
    }
});

// La visita se valida y guarda en Supabase, evitando puntos duplicados.
validateRouteButton.addEventListener("click", async () => {
    const code = routeCode.value.trim().toUpperCase();
    if (!code) {
        routeMessage.textContent = "Escribe una clave o selecciona una imagen con un QR.";
        return;
    }
    if (!supabaseClient) {
        routeMessage.textContent = "Falta configurar la conexión con Supabase.";
        return;
    }
    if (!currentUser) {
        routeMessage.textContent = "Inicia sesión para poder validar visitas.";
        return;
    }

    routeMessage.textContent = "Comprobando código...";

    const { data: place, error: placeError } = await supabaseClient
        .from("places")
        .select("id, name, points, route_id, routes(name)")
        .eq("qr_code", code)
        .maybeSingle();

    if (placeError || !place) {
        routeMessage.textContent = "No hemos encontrado ningún lugar con esa clave.";
        return;
    }

    const { error: visitError } = await supabaseClient
        .from("visits")
        .insert({ user_id: currentUser.id, route_id: place.route_id, place_id: place.id, points: place.points });

    if (visitError) {
        routeMessage.textContent = visitError.code === "23505"
            ? "Ya habías validado este lugar antes."
            : "No se ha podido guardar la visita. Inténtalo de nuevo.";
        return;
    }

    routeMessage.textContent = `"${place.name}" validado. Has conseguido ${place.points} puntos.`;
    markActiveRoute({ id: place.route_id, name: place.routes?.name || "Ruta en curso" });
    await refreshUserProgress();
    await loadRanking();
    routeCode.value = "";
});

/* =========================
    BLOQUE DE RUTAS ACTIVAS
    ========================= */
const routesContent = document.querySelector("#routes-content");
const activeRouteMessage = document.createElement("p");
activeRouteMessage.className = "active-route-message";
progressCard?.append(activeRouteMessage);

// Guarda qué ruta está siguiendo la persona y resalta su tarjeta.
function markActiveRoute(route) {
    // El id permite consultar los lugares; el nombre sirve para recuperar el estado visual.
    localStorage.setItem("caceresgo-active-route", route.name);
    localStorage.setItem("caceresgo-active-route-id", route.id);
    activeRouteMessage.textContent = `Ruta en curso: ${route.name}`;
    document.querySelectorAll(".route").forEach((card) => {
        const startButton = card.querySelector(".start-route-button");
        const isActive = card.dataset.routeId === String(route.id);
        card.classList.toggle("active-route", isActive);
        if (startButton) startButton.textContent = isActive ? "Ruta en curso" : "Iniciar ruta";
    });
}

// Añade el botón "Iniciar ruta" a cada tarjeta que haya en pantalla.
function attachRouteStartButtons() {
    // Se evita duplicar botones si las tarjetas se vuelven a renderizar.
    document.querySelectorAll(".route").forEach((card) => {
        if (card.querySelector(".start-route-button")) return;
        const startButton = document.createElement("button");
        startButton.className = "start-route-button";
        startButton.type = "button";
        startButton.textContent = "Iniciar ruta";
        card.append(startButton);
        startButton.addEventListener("click", async () => {
            const savedUser = currentUser;
            if (!savedUser) {
                document.querySelector("#auth-modal")?.classList.add("open");
                return;
            }
            markActiveRoute({ id: card.dataset.routeId, name: card.querySelector("h3").textContent });
            showPage("progress");
            await refreshUserProgress();
        });
    });
}

// Construye la tarjeta visual de un recorrido con los datos reales de Supabase.
function buildRouteCardMarkup(route, index) {
    // Las clases alternan el aspecto de las tarjetas sin afectar a los datos.
    const styleClasses = ["large", "sand", "lime"];
    const icons = ["⌘", "♜", "✹"];
    const styleClass = styleClasses[index % styleClasses.length];
    const icon = icons[index % icons.length];
    const tag = index === 0 ? "Más popular" : "Recorrido";
    return `<article class="route ${styleClass}" data-route-id="${route.id}"><span class="route-tag">${tag}</span><span class="number">${String(index + 1).padStart(2, "0")}</span><h3>${escapeAdminText(route.name)}</h3><p>${escapeAdminText(route.duration || "")} · ${route.points} puntos</p><span class="route-icon">${icon}</span></article>`;
}

// Carga los recorridos publicados desde Supabase y sustituye las tarjetas de ejemplo.
async function loadPublicRoutes() {
    // Si Supabase no esta configurado se conservan las tarjetas incluidas en el HTML.
    if (!supabaseClient) { attachRouteStartButtons(); return; }

    const { data: routes, error } = await supabaseClient
        .from("routes")
        .select("id, name, duration, points")
        .eq("status", "published")
        .order("created_at");

    const routeCountLabel = document.querySelector("#route-count");
    if (routeCountLabel) routeCountLabel.textContent = routes?.length ?? "—";

    if (error || !routes || !routes.length) { attachRouteStartButtons(); return; }

    routesContent.innerHTML = routes.map(buildRouteCardMarkup).join("");
    attachRouteStartButtons();

    const savedRouteId = localStorage.getItem("caceresgo-active-route-id");
    const savedRouteName = localStorage.getItem("caceresgo-active-route");
    if (savedRouteId && savedRouteName) markActiveRoute({ id: savedRouteId, name: savedRouteName });
}

/* =========================
    BLOQUE DE NAVEGACION
    ========================= */
document.querySelector("#account-button")?.addEventListener("click", (event) => {
    event.preventDefault();
    if (currentUser) {
        showPage("profile");
    } else {
        document.querySelector("#auth-modal")?.classList.add("open");
    }
});

document.querySelector("#wall-login")?.addEventListener("click", () => {
    document.querySelector("#auth-modal")?.classList.add("open");
});
document.querySelector("#routes-login")?.addEventListener("click", () => {
    document.querySelector("#auth-modal")?.classList.add("open");
});

function showPage(view) {
    // La aplicacion usa una sola pagina HTML y alterna vistas mediante clases del body.
    document.body.classList.remove("home-view", "progress-view", "route-view", "ranking-view", "profile-view", "admin-view");
    document.body.classList.add(`${view}-view`);
    window.scrollTo({ top: 0, behavior: "smooth" });
}

document.querySelectorAll('a[href="#progreso"]').forEach((link) => {
    link.addEventListener("click", (event) => { event.preventDefault(); showPage("progress"); });
});
document.querySelectorAll('a[href="#ranking"]').forEach((link) => {
    link.addEventListener("click", (event) => { event.preventDefault(); showPage("ranking"); });
});
document.querySelectorAll('a[href="#rutas"]').forEach((link) => {
    link.addEventListener("click", (event) => { event.preventDefault(); showPage("route"); });
});
document.querySelectorAll('a[href="#inicio"]').forEach((link) => {
    link.addEventListener("click", (event) => { event.preventDefault(); showPage("home"); });
});

/* =========================
    BLOQUE DE USUARIOS
    ========================= */
const authModal = document.querySelector("#auth-modal");
const authForm = document.querySelector("#auth-form");
const authTabs = document.querySelectorAll("[data-tab]");
const nameField = document.querySelector("#name-field");
const authName = document.querySelector("#auth-name");
const authEmail = document.querySelector("#auth-email");
const authPassword = document.querySelector("#auth-password");
const authSubmit = document.querySelector("#auth-submit");
const formMessage = document.querySelector("#form-message");
const accountLabel = document.querySelector("#account-label");
const logoutButton = document.querySelector("#logout-button");
const profileName = document.querySelector("#profile-name");
const profileEmail = document.querySelector("#profile-email");
const profileBirth = document.querySelector("#profile-birth");
const profileCity = document.querySelector("#profile-city");
const saveProfile = document.querySelector("#save-profile");
const profileMessage = document.querySelector("#profile-message");
const passwordForm = document.querySelector("#password-form");
const currentPassword = document.querySelector("#current-password");
const newPassword = document.querySelector("#new-password");
const repeatPassword = document.querySelector("#repeat-password");
const passwordMessage = document.querySelector("#password-message");
const profileProgress = document.querySelector("#profile-progress");
const authWall = document.querySelector("#auth-wall");
const privateContent = document.querySelector("#private-content");
const routesWall = document.querySelector("#routes-wall");
let authMode = "login";

authName?.setAttribute("autocomplete", "name");
authEmail?.setAttribute("autocomplete", "username");
authPassword?.setAttribute("autocomplete", "current-password");

function setAuthMode(mode) {
    authMode = mode;
    authTabs.forEach((tab) => tab.classList.toggle("active", tab.dataset.tab === mode));
    nameField.hidden = mode !== "register";
    authName.required = mode === "register";
    authSubmit.textContent = mode === "register" ? "Crear cuenta" : "Iniciar sesión";
    formMessage.textContent = "";
}

// Pinta en la página los datos de la persona que acaba de conectarse.
function updateSignedInUser(profile) {
    // El perfil de Supabase es la fuente de verdad de los datos de la cuenta.
    currentUser = profile;
    accountLabel.textContent = profile.name;
    profileName.textContent = profile.name;
    profileEmail.textContent = profile.email;
    profileBirth.value = profile.birth_date || "";
    profileCity.value = profile.city || "";
    logoutButton.hidden = false;
    authWall.classList.add("hidden");
    privateContent.classList.add("visible");
    routesWall.classList.add("hidden");
}

function clearSignedInUser() {
    // Limpia la interfaz cuando termina la sesion de Supabase.
    currentUser = null;
    accountLabel.textContent = "Entrar / Registrarse";
    logoutButton.hidden = true;
    authWall.classList.remove("hidden");
    privateContent.classList.remove("visible");
}

// Recupera la fila de "profiles" que corresponde a la cuenta autenticada.
async function fetchProfile(userId) {
    // Auth identifica a la persona; profiles contiene sus datos de la aplicacion.
    const { data, error } = await supabaseClient.from("profiles").select("*").eq("id", userId).single();
    return error ? null : data;
}

// Mantiene un modo local temporal hasta que se configure la conexion de Supabase.
function getLocalUsers() {
    // Este respaldo permite probar el registro antes de pegar las claves de Supabase.
    const users = JSON.parse(localStorage.getItem("caceresgo-local-users") || "[]");
    const previousUser = JSON.parse(localStorage.getItem("caceresgo-user") || "null");
    if (previousUser && !users.some((user) => user.email === previousUser.email)) {
        // Migra las cuentas creadas por la primera version del prototipo.
        users.push({ id: previousUser.id || crypto.randomUUID(), name: previousUser.name, email: previousUser.email, password: previousUser.password, role: "participant", status: "active", birth_date: previousUser.birth_date || "", city: previousUser.city || "" });
        localStorage.setItem("caceresgo-local-users", JSON.stringify(users));
    }
    return users;
}

profileProgress?.addEventListener("click", () => showPage("progress"));

saveProfile?.addEventListener("click", async () => {
    if (!currentUser) return;
    if (!supabaseClient) {
        // Sin Supabase los datos solo se conservan en este navegador.
        currentUser.birth_date = profileBirth.value || "";
        currentUser.city = profileCity.value.trim();
        localStorage.setItem("caceresgo-local-user", JSON.stringify(currentUser));
        localStorage.setItem("caceresgo-local-users", JSON.stringify(getLocalUsers().map((user) => user.id === currentUser.id ? currentUser : user)));
        profileMessage.textContent = "Datos guardados en este navegador. Configura Supabase para guardarlos en la nube.";
        return;
    }
    const { error } = await supabaseClient
        .from("profiles")
        .update({ birth_date: profileBirth.value || null, city: profileCity.value.trim() })
        .eq("id", currentUser.id);
    profileMessage.textContent = error ? "No se han podido guardar los datos." : "Datos guardados correctamente.";
    if (!error) { currentUser.birth_date = profileBirth.value; currentUser.city = profileCity.value.trim(); }
});

passwordForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!currentUser) return;
    if (!supabaseClient) {
        // Este camino es solo de demostracion; Supabase gestiona las contraseñas reales.
        if (currentUser.password !== currentPassword.value) {
            passwordMessage.textContent = "La contraseña actual no es correcta.";
            return;
        }
        if (newPassword.value !== repeatPassword.value) {
            passwordMessage.textContent = "Las nuevas contraseñas no coinciden.";
            return;
        }
        currentUser.password = newPassword.value;
        localStorage.setItem("caceresgo-local-user", JSON.stringify(currentUser));
        localStorage.setItem("caceresgo-local-users", JSON.stringify(getLocalUsers().map((user) => user.id === currentUser.id ? currentUser : user)));
        passwordForm.reset();
        passwordMessage.textContent = "Contraseña cambiada en este navegador.";
        return;
    }
    // Supabase no devuelve la contraseña: se comprueba intentando autenticarla.
    const { error: checkError } = await supabaseClient.auth.signInWithPassword({ email: currentUser.email, password: currentPassword.value });
    if (checkError) { passwordMessage.textContent = "La contraseña actual no es correcta."; return; }
    if (newPassword.value !== repeatPassword.value) { passwordMessage.textContent = "Las nuevas contraseñas no coinciden."; return; }
    const { error } = await supabaseClient.auth.updateUser({ password: newPassword.value });
    passwordMessage.textContent = error ? "No se ha podido cambiar la contraseña." : "Contraseña cambiada correctamente.";
    if (!error) passwordForm.reset();
});

logoutButton?.addEventListener("click", async () => {
    // Se cierran tanto la sesion remota como la sesion local de respaldo.
    if (supabaseClient) await supabaseClient.auth.signOut();
    localStorage.removeItem("caceresgo-local-user");
    localStorage.removeItem("caceresgo-active-route");
    localStorage.removeItem("caceresgo-active-route-id");
    clearSignedInUser();
    showPage("home");
});

authTabs.forEach((tab) => {
    tab.addEventListener("click", (event) => {
        event.preventDefault();
        authForm.reset();
        setAuthMode(tab.dataset.tab);
    });
});

authForm?.addEventListener("submit", async (event) => {
    // El registro y el acceso se resuelven mediante Supabase Auth.
    event.preventDefault();
    const email = authEmail.value.trim().toLowerCase();
    const password = authPassword.value;

    if (!supabaseClient) {
        // Mientras no haya credenciales, se usa una lista persistente del navegador.
        const localUsers = getLocalUsers();
        if (authMode === "register") {
            if (localUsers.some((user) => user.email === email)) {
                formMessage.textContent = "Ya existe una cuenta con ese correo en este navegador.";
                return;
            }
            const localUser = { id: crypto.randomUUID(), name: authName.value.trim(), email, password, role: "participant", status: "active", birth_date: "", city: "" }; // La contraseña se guarda en texto plano solo en este modo de demostración.
            localUsers.push(localUser);
            localStorage.setItem("caceresgo-local-users", JSON.stringify(localUsers));
            localStorage.setItem("caceresgo-local-user", JSON.stringify(localUser));
            updateSignedInUser(localUser);
            authModal.classList.remove("open");
            authForm.reset();
            return;
        }
        const localUser = localUsers.find((user) => user.email === email && user.password === password);
        if (!localUser) {
            formMessage.textContent = "El correo o la contraseña no son correctos.";
            return;
        }
        localStorage.setItem("caceresgo-local-user", JSON.stringify(localUser));
        updateSignedInUser(localUser);
        authModal.classList.remove("open");
        authForm.reset();
        return;
    }

    if (authMode === "register") {
        const name = authName.value.trim();
        // El nombre viaja en los metadatos para que el trigger cree el perfil.
        const { data, error } = await supabaseClient.auth.signUp({
            email,
            password,
            options: { data: { name } }
        });
        if (error) { formMessage.textContent = "No se ha podido crear la cuenta: " + error.message; return; }
        if (!data.session) {
            formMessage.textContent = "Cuenta creada. Revisa tu correo para confirmarla antes de iniciar sesión.";
            authForm.reset();
            setAuthMode("login");
            return;
        }
        const profile = await fetchProfile(data.user.id);
        if (profile) updateSignedInUser(profile);
        authModal.classList.remove("open");
        authForm.reset();
        setAuthMode("login");
        return;
    }

    const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
    if (error || !data.user) { formMessage.textContent = "El correo o la contraseña no son correctos."; return; }
    const profile = await fetchProfile(data.user.id);
    if (!profile) { formMessage.textContent = "No se ha encontrado tu perfil."; return; }
    if (profile.status === "blocked") {
        await supabaseClient.auth.signOut();
        formMessage.textContent = "Esta cuenta está bloqueada.";
        return;
    }
    updateSignedInUser(profile);
    authModal.classList.remove("open");
    authForm.reset();
});

// Si ya había una sesión guardada por Supabase, se recupera al cargar la página.
async function restoreSession() {
    // Recupera la sesion persistida por el cliente oficial de Supabase.
    if (!supabaseClient) {
        // El modo local recupera la ultima cuenta usada tras recargar la pagina.
        const localUser = JSON.parse(localStorage.getItem("caceresgo-local-user") || "null");
        if (localUser) updateSignedInUser(localUser);
        return;
    }
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (!session) return;
    const profile = await fetchProfile(session.user.id);
    if (profile) updateSignedInUser(profile);
}

/* =========================
    BLOQUE DE PROGRESO Y CLASIFICACIÓN
    ========================= */
// Actualiza puntos, barra de progreso y paradas de la ruta activa con datos reales.
async function refreshUserProgress() {
    // Calcula los puntos y lugares visitados a partir de las filas guardadas.
    if (!supabaseClient || !currentUser) return;

    const { data: allVisits } = await supabaseClient.from("visits").select("points").eq("user_id", currentUser.id);
    const totalPoints = (allVisits || []).reduce((sum, visit) => sum + visit.points, 0);
    const pointsLabel = document.querySelector("#user-points");
    if (pointsLabel) pointsLabel.textContent = totalPoints;

    const activeRouteId = localStorage.getItem("caceresgo-active-route-id");
    if (!activeRouteId) return;

    const { data: places } = await supabaseClient.from("places").select("id, name").eq("route_id", activeRouteId).order("order_index");
    const { data: visitedRows } = await supabaseClient.from("visits").select("place_id").eq("user_id", currentUser.id).eq("route_id", activeRouteId);
    const visitedIds = new Set((visitedRows || []).map((row) => row.place_id));

    const total = places?.length || 0;
    const done = places ? places.filter((place) => visitedIds.has(place.id)).length : 0;
    const percent = total ? Math.round((done / total) * 100) : 0;

    const progressText = document.querySelector("#user-progress-text");
    const progressPercent = document.querySelector("#user-progress-percent");
    const progressBar = document.querySelector("#user-progress-bar");
    if (progressText) progressText.textContent = `${done} de ${total} lugares descubiertos`;
    if (progressPercent) progressPercent.textContent = `${percent}%`;
    if (progressBar) progressBar.style.width = `${percent}%`;

    const checkpointsContainer = document.querySelector(".checkpoints");
    if (checkpointsContainer && places) {
        checkpointsContainer.innerHTML = places.map((place, index) => `<div class="check ${visitedIds.has(place.id) ? "" : "pending"}"><i>${visitedIds.has(place.id) ? "✓" : index + 1}</i>${escapeAdminText(place.name)}</div>`).join("");
    }

    if (total && done === total) {
        await supabaseClient.from("route_completions").upsert(
            { user_id: currentUser.id, route_id: activeRouteId, points: totalPoints },
            { onConflict: "user_id,route_id" }
        );
    }
}

// Calcula y pinta la clasificación general sumando los puntos de todas las visitas.
async function loadRanking() {
    // Agrupa las visitas por usuario para construir la clasificacion.
    if (!supabaseClient) return;
    const { data: visits } = await supabaseClient.from("visits").select("user_id, points, profiles(name)");
    const rankingContainer = document.querySelector("#ranking");
    if (!visits || !rankingContainer) return;

    const totals = new Map();
    visits.forEach((visit) => {
        const entry = totals.get(visit.user_id) || { name: visit.profiles?.name || "Explorador", points: 0 };
        entry.points += visit.points;
        totals.set(visit.user_id, entry);
    });
    const ranked = Array.from(totals.values()).sort((a, b) => b.points - a.points).slice(0, 10);

    rankingContainer.querySelectorAll(".rank").forEach((row) => row.remove());
    ranked.forEach((entry, index) => {
        const row = document.createElement("div");
        row.className = "rank";
        const isYou = currentUser && entry.name === currentUser.name;
        row.innerHTML = `<b>${String(index + 1).padStart(2, "0")}</b><span>${escapeAdminText(entry.name)}${isYou ? " ✦" : ""}</span><small>${entry.points} pts</small>`;
        rankingContainer.append(row);
    });
}

// Rellena el número de recorridos, visitas y personas registradas de la portada.
async function loadPublicStats() {
    // Las cifras de portada se consultan como conteos, sin descargar todos los registros.
    if (!supabaseClient) return;
    const [{ count: visitCount }, { count: userCount }] = await Promise.all([
        supabaseClient.from("visits").select("*", { count: "exact", head: true }),
        supabaseClient.from("profiles").select("*", { count: "exact", head: true })
    ]);
    const visitLabel = document.querySelector("#visit-count");
    const userLabel = document.querySelector("#user-count");
    if (visitLabel && visitCount !== null) visitLabel.textContent = visitCount;
    if (userLabel && userCount !== null) userLabel.textContent = userCount;
}

/* =========================
    BLOQUE DEL PANEL ADMINISTRADOR
    ========================= */
const adminPanel = document.querySelector("#admin-panel");
const adminExit = document.querySelector("#admin-exit");
const adminTabs = document.querySelectorAll("[data-admin-tab]");
const adminViews = document.querySelectorAll("[data-admin-view]");
const routeForm = document.querySelector("#route-form");
const routeIdField = document.querySelector("#route-id");
const routeNameField = document.querySelector("#route-name");
const routeDescriptionField = document.querySelector("#route-description");
const routeDurationField = document.querySelector("#route-duration");
const routePointsField = document.querySelector("#route-points");
const routeFormTitle = document.querySelector("#route-form-title");
const routeCancel = document.querySelector("#route-cancel");
const routeMessageAdmin = document.querySelector("#route-message");
const routesList = document.querySelector("#admin-routes-list");
const placesList = document.querySelector("#admin-places-list");
const usersList = document.querySelector("#admin-users-list");
const resultsList = document.querySelector("#admin-results-list");
const placeModal = document.querySelector("#place-modal");
const placeForm = document.querySelector("#place-form");
const placeIdField = document.querySelector("#place-id");
const placeNameField = document.querySelector("#place-name");
const placeCodeField = document.querySelector("#place-code");
const placePointsField = document.querySelector("#place-points");
let selectedRouteId = null;
let cachedRoutes = [];
let cachedPlaces = [];

function escapeAdminText(value) {
    // Los nombres procedentes de la base de datos se escapan antes de insertarlos en HTML.
    return String(value).replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[character]));
}

async function renderAdminRoutes() {
    // El administrador solo edita recorridos publicados en la base de datos.
    if (!supabaseClient) return;
    const { data: routes } = await supabaseClient.from("routes").select("id, name, description, duration, points").order("created_at");
    cachedRoutes = routes || [];
    document.querySelector("#route-total").textContent = cachedRoutes.length;
    routesList.innerHTML = cachedRoutes.length
        ? cachedRoutes.map((route) => `<div class="admin-item"><div><strong>${escapeAdminText(route.name)}</strong><small>${escapeAdminText(route.duration || "")} · ${route.points} puntos</small></div><div class="admin-item-actions"><button type="button" data-select-route="${route.id}">Lugares</button><button type="button" data-edit-route="${route.id}">Editar</button><button type="button" data-delete-route="${route.id}">Eliminar</button></div></div>`).join("")
        : '<p class="empty-admin">Todavía no hay recorridos publicados.</p>';
    if (!selectedRouteId || !cachedRoutes.some((route) => route.id === selectedRouteId)) selectedRouteId = cachedRoutes[0]?.id || null;
    await renderAdminPlaces();
}

async function renderAdminPlaces() {
    // Los lugares se cargan por recorrido para mantener la relacion route_id.
    if (!supabaseClient || !selectedRouteId) {
        placesList.innerHTML = '<p class="empty-admin">Selecciona un recorrido y añade sus lugares de interés.</p>';
        return;
    }
    const { data: places } = await supabaseClient.from("places").select("id, name, qr_code, points").eq("route_id", selectedRouteId).order("order_index");
    cachedPlaces = places || [];
    placesList.innerHTML = cachedPlaces.length
        ? cachedPlaces.map((place) => `<div class="admin-item"><div><strong>${escapeAdminText(place.name)}</strong><small>QR: ${escapeAdminText(place.qr_code)} · ${place.points} puntos</small></div><div class="admin-item-actions"><button type="button" data-edit-place="${place.id}">Editar</button><button type="button" data-delete-place="${place.id}">Eliminar</button></div></div>`).join("")
        : '<p class="empty-admin">Selecciona un recorrido y añade sus lugares de interés.</p>';
}

async function renderAdminUsers() {
    // Desde el navegador se puede cambiar el estado del perfil, no borrar Auth.
    if (!supabaseClient) return;
    const { data: users } = await supabaseClient.from("profiles").select("id, name, email, status").order("created_at");
    document.querySelector("#user-total").textContent = users?.length || 0;
    usersList.innerHTML = users?.length
        ? users.map((user) => `<div class="admin-item"><div><strong>${escapeAdminText(user.name)}</strong><small>${escapeAdminText(user.email)}</small></div><div class="admin-item-actions"><span class="status-pill">${user.status === "blocked" ? "bloqueada" : "activa"}</span><button type="button" data-toggle-user="${user.id}" data-current-status="${user.status}">${user.status === "blocked" ? "Activar" : "Bloquear"}</button></div></div>`).join("")
        : '<p class="empty-admin">Las cuentas creadas aparecerán aquí.</p>';
}

async function renderAdminResults() {
    // Los resultados combinan el participante, la ruta y la fecha de finalizacion.
    if (!supabaseClient) return;
    const { data: completions } = await supabaseClient.from("route_completions").select("points, completed_at, profiles(name), routes(name)").order("completed_at", { ascending: false });
    document.querySelector("#result-total").textContent = completions?.length || 0;
    resultsList.innerHTML = completions?.length
        ? completions.map((item) => `<div class="admin-item"><div><strong>${escapeAdminText(item.profiles?.name || "—")} · ${escapeAdminText(item.routes?.name || "—")}</strong><small>${new Date(item.completed_at).toLocaleDateString("es-ES")}</small></div><strong>${item.points} puntos</strong></div>`).join("")
        : '<p class="empty-admin">Todavía no hay rutas terminadas.</p>';
}

async function openAdminPanel() {
    // Se refrescan las tres secciones antes de mostrar el panel.
    await renderAdminRoutes();
    await renderAdminUsers();
    await renderAdminResults();
    showPage("admin");
}

adminTabs.forEach((tab) => tab.addEventListener("click", () => {
    adminTabs.forEach((item) => item.classList.toggle("active", item === tab));
    adminViews.forEach((view) => view.classList.toggle("active", view.dataset.adminView === tab.dataset.adminTab));
}));

routeForm?.addEventListener("submit", async (event) => {
    // El mismo formulario sirve para crear y modificar recorridos.
    event.preventDefault();
    const routeData = {
        name: routeNameField.value.trim(),
        description: routeDescriptionField.value.trim(),
        duration: routeDurationField.value.trim(),
        points: Number(routePointsField.value)
    };
    let error;
    if (routeIdField.value) {
        ({ error } = await supabaseClient.from("routes").update(routeData).eq("id", routeIdField.value));
    } else {
        routeData.status = "published";
        routeData.created_by = currentUser?.id || null;
        ({ error } = await supabaseClient.from("routes").insert(routeData));
    }
    if (error) { routeMessageAdmin.textContent = "No se ha podido guardar el recorrido."; return; }
    routeForm.reset();
    routeIdField.value = "";
    routeFormTitle.textContent = "Nuevo recorrido";
    routeCancel.hidden = true;
    routeMessageAdmin.textContent = "Recorrido guardado correctamente.";
    await renderAdminRoutes();
    await loadPublicRoutes();
});

routeCancel?.addEventListener("click", () => {
    routeForm.reset();
    routeIdField.value = "";
    routeFormTitle.textContent = "Nuevo recorrido";
    routeCancel.hidden = true;
});

routesList?.addEventListener("click", async (event) => {
    const button = event.target.closest("button");
    if (!button) return;
    const id = button.dataset.selectRoute || button.dataset.editRoute || button.dataset.deleteRoute;
    const route = cachedRoutes.find((item) => item.id === id);
    if (!route) return;

    if (button.dataset.selectRoute) { selectedRouteId = route.id; await renderAdminPlaces(); return; }

    if (button.dataset.editRoute) {
        routeIdField.value = route.id;
        routeNameField.value = route.name;
        routeDescriptionField.value = route.description || "";
        routeDurationField.value = route.duration || "";
        routePointsField.value = route.points;
        routeFormTitle.textContent = "Editar recorrido";
        routeCancel.hidden = false;
        return;
    }

    if (button.dataset.deleteRoute && confirm(`¿Eliminar "${route.name}"?`)) {
        await supabaseClient.from("routes").delete().eq("id", route.id);
        await renderAdminRoutes();
        await loadPublicRoutes();
    }
});

document.querySelector("#place-add")?.addEventListener("click", () => {
    if (!selectedRouteId) return;
    placeForm.reset();
    placeIdField.value = "";
    placeModal.classList.add("open");
});

placeForm?.addEventListener("submit", async (event) => {
    // El codigo QR se normaliza para que no dependa de mayusculas o espacios.
    event.preventDefault();
    if (!selectedRouteId) return;
    const data = {
        name: placeNameField.value.trim(),
        qr_code: placeCodeField.value.trim().toUpperCase(),
        points: Number(placePointsField.value),
        route_id: selectedRouteId
    };
    let error;
    if (placeIdField.value) {
        ({ error } = await supabaseClient.from("places").update(data).eq("id", placeIdField.value));
    } else {
        ({ error } = await supabaseClient.from("places").insert(data));
    }
    const placeMessage = document.querySelector("#place-message");
    if (error) {
        placeMessage.textContent = error.code === "23505" ? "Ya existe un lugar con esa clave QR." : "No se ha podido guardar el lugar.";
        return;
    }
    placeModal.classList.remove("open");
    await renderAdminPlaces();
});

placesList?.addEventListener("click", async (event) => {
    const button = event.target.closest("button");
    if (!button) return;
    const id = button.dataset.editPlace || button.dataset.deletePlace;
    const place = cachedPlaces.find((item) => item.id === id);
    if (!place) return;

    if (button.dataset.editPlace) {
        placeIdField.value = place.id;
        placeNameField.value = place.name;
        placeCodeField.value = place.qr_code;
        placePointsField.value = place.points;
        placeModal.classList.add("open");
    } else if (confirm(`¿Eliminar "${place.name}"?`)) {
        await supabaseClient.from("places").delete().eq("id", place.id);
        await renderAdminPlaces();
    }
});

usersList?.addEventListener("click", async (event) => {
    const button = event.target.closest("button");
    if (!button || !button.dataset.toggleUser) return;
    const newStatus = button.dataset.currentStatus === "blocked" ? "active" : "blocked";
    await supabaseClient.from("profiles").update({ status: newStatus }).eq("id", button.dataset.toggleUser);
    await renderAdminUsers();
});
// Nota: borrar del todo una cuenta requiere eliminar también su usuario de
// Supabase Auth, algo que solo se puede hacer con la clave "service_role"
// desde un servidor, nunca desde el navegador. Por eso aquí solo se bloquea.

adminExit?.addEventListener("click", async () => {
    if (supabaseClient) await supabaseClient.auth.signOut();
    document.body.classList.remove("admin-view");
    showPage("home");
});

/* =========================
    BLOQUE DEL ADMINISTRADOR (acceso)
    ========================= */
const adminOpen = document.querySelector("#admin-open");
const adminModal = document.querySelector("#admin-modal");
const adminForm = document.querySelector("#admin-form");
const adminEmail = document.querySelector("#admin-email");
const adminPassword = document.querySelector("#admin-password");
const adminMessage = document.querySelector("#admin-message");

adminOpen?.addEventListener("click", () => {
    // El formulario de acceso se muestra desde el pie de pagina.
    adminMessage.textContent = "";
    adminModal.classList.add("open");
});

adminForm?.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (!supabaseClient) {
        adminMessage.textContent = "Falta configurar la conexión segura del servidor.";
        return;
    }

    adminMessage.textContent = "Comprobando acceso...";
    const { data, error } = await supabaseClient.auth.signInWithPassword({
        email: adminEmail.value.trim().toLowerCase(),
        password: adminPassword.value
    });

    if (error || !data.user) {
        adminMessage.textContent = "El correo o la contraseña no son correctos.";
        return;
    }

    // El rol se comprueba en profiles, nunca en un dato enviado por el navegador.
    const { data: profile, error: profileError } = await supabaseClient
        .from("profiles")
        .select("role")
        .eq("id", data.user.id)
        .single();

    if (profileError || profile?.role !== "admin") {
        await supabaseClient.auth.signOut();
        adminMessage.textContent = "Esta cuenta no tiene permisos de administrador.";
        return;
    }

    adminForm.reset();
    adminModal.classList.remove("open");
    adminMessage.textContent = "";
    await openAdminPanel();
});

/* =========================
    PUESTA EN MARCHA
    ========================= */
(async function init() {
    // Carga inicial: sesion, rutas, estadisticas, ranking y progreso.
    await restoreSession();
    await loadPublicRoutes();
    await loadPublicStats();
    await loadRanking();
    await refreshUserProgress();
})();

locateUser();
