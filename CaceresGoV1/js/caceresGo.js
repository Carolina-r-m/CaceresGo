/* =========================
    BLOQUE DEL MAPA
    ========================= */
const mapElement = document.querySelector("#location-map");
const locateButton = document.querySelector("#locate-me");
const locationStatus = document.querySelector("#location-status");
const mapBounds = "-6.3867%2C39.4665%2C-6.3567%2C39.4841";
// Estos elementos pertenecen a la tarjeta del mapa.

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

// Se muestra el mapa de Cáceres antes de pedir la ubicación del usuario.
function locateUser() {
    // La geolocalización necesita permiso del navegador y puede no estar disponible.
    if (!navigator.geolocation) {
        setLocationStatus("Tu navegador no permite obtener la ubicación.", "error");
        return;
    }

    locateButton.disabled = true;
    setLocationStatus("Permitir ubicación a la página para mostrar tu posición...");
    // Si el usuario acepta el permiso, se actualiza el mapa con su posición.
    navigator.geolocation.getCurrentPosition(({ coords }) => {
        const { latitude, longitude } = coords;
        showMap(latitude, longitude);
        setLocationStatus(`Ubicación encontrada: ${latitude.toFixed(5)}, ${longitude.toFixed(5)}`, "success");
        locateButton.disabled = false;
    // Si ocurre algún problema, se informa al usuario en vez de dejarlo sin respuesta.
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
    BLOQUE DE VENTANAS Y QR
    ========================= */
// Ventana para validar una visita y botones para cerrarla.
document.querySelectorAll("[data-open]").forEach((button) => {
    button.addEventListener("click", () => document.querySelector("#modal").classList.add("open"));
});

document.querySelectorAll("[data-close]").forEach((button) => {
    button.addEventListener("click", () => button.closest(".modal").classList.remove("open"));
});

// Botón para leer el QR de una ruta desde la página de progreso.
const progressCard = document.querySelector(".progress-card");
const routeScanButton = document.createElement("button");
routeScanButton.className = "primary scan-route-button";
routeScanButton.type = "button";
routeScanButton.textContent = "Leer QR de una ruta";
progressCard?.append(routeScanButton);

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
    routeModalTitle.textContent = "Lee el QR de tu ruta";
    routeMessage.textContent = "Selecciona una foto del QR o escribe la clave de la ruta.";
    routeModal.classList.add("open");
    qrFileInput.click();
});

// Intenta leer el código de una imagen usando la función disponible en algunos navegadores.
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

// Al validar una clave se actualiza el progreso de la primera ruta.
validateRouteButton.addEventListener("click", () => {
    if (!routeCode.value.trim()) {
        routeMessage.textContent = "Escribe una clave o selecciona una imagen con un QR.";
        return;
    }
    document.querySelector("#user-points").textContent = "50";
    document.querySelector("#user-progress-text").textContent = "1 lugar descubierto";
    document.querySelector("#user-progress-percent").textContent = "20%";
    document.querySelector("#user-progress-bar").style.width = "20%";
    routeMessage.textContent = "Ruta validada. Has conseguido 50 puntos.";
});

/* =========================
    BLOQUE DE RUTAS ACTIVAS
    ========================= */
// Permite empezar una ruta desde sus tarjetas.
const routeCards = document.querySelectorAll(".route");
const activeRouteMessage = document.createElement("p");
activeRouteMessage.className = "active-route-message";
progressCard?.append(activeRouteMessage);

function markActiveRoute(routeName) {
    // Se guarda el nombre de la ruta para recordarla aunque se recargue la página.
    localStorage.setItem("caceresgo-active-route", routeName);
    activeRouteMessage.textContent = `Ruta en curso: ${routeName}`;
    routeCards.forEach((card) => {
        const startButton = card.querySelector(".start-route-button");
        const isActive = card.querySelector("h3")?.textContent === routeName;
        card.classList.toggle("active-route", isActive);
        if (startButton) startButton.textContent = isActive ? "Ruta en curso" : "Iniciar ruta";
    });
}

routeCards.forEach((card) => {
    // El botón se crea desde JavaScript para no repetirlo en cada tarjeta del HTML.
    const startButton = document.createElement("button");
    startButton.className = "start-route-button";
    startButton.type = "button";
    startButton.textContent = "Iniciar ruta";
    card.append(startButton);
    startButton.addEventListener("click", () => {
        const savedUser = localStorage.getItem("caceresgo-user");
        if (!savedUser) {
            // Una persona invitada tiene que iniciar sesión antes de empezar.
            document.querySelector("#auth-modal")?.classList.add("open");
            return;
        }
        // Cuando hay sesión, la ruta se marca como activa y se abre el progreso.
        const routeName = card.querySelector("h3").textContent;
        markActiveRoute(routeName);
        showPage("progress");
    });
});

const savedRoute = localStorage.getItem("caceresgo-active-route");
if (savedRoute) markActiveRoute(savedRoute);

/* =========================
    BLOQUE DE NAVEGACION
    ========================= */
// Solo se muestra el acceso si todavía no hay una sesión iniciada.
document.querySelector("#account-button")?.addEventListener("click", (event) => {
    event.preventDefault();
    const savedUser = localStorage.getItem("caceresgo-user");
    if (savedUser) {
        // Al pulsar el nombre se abre la página con los datos personales.
        showPage("profile");
    } else {
        document.querySelector("#auth-modal")?.classList.add("open");
    }
});

// Estos botones abren el mismo formulario desde las zonas privadas.
document.querySelector("#wall-login")?.addEventListener("click", () => {
    document.querySelector("#auth-modal")?.classList.add("open");
});
document.querySelector("#routes-login")?.addEventListener("click", () => {
    document.querySelector("#auth-modal")?.classList.add("open");
});

// Las secciones se comportan como páginas aunque todo esté en el mismo HTML.
function showPage(view) {
    // Solo se mantiene visible una vista cada vez.
    document.body.classList.remove("home-view", "progress-view", "route-view", "ranking-view", "profile-view");
    document.body.classList.add(`${view}-view`);
    window.scrollTo({ top: 0, behavior: "smooth" });
}

document.querySelectorAll('a[href="#progreso"]').forEach((link) => {
    // El progreso se muestra como una página independiente.
    link.addEventListener("click", (event) => {
        event.preventDefault();
        showPage("progress");
    });
});

document.querySelectorAll('a[href="#ranking"]').forEach((link) => {
    // El ranking se puede consultar aunque no haya una sesión iniciada.
    link.addEventListener("click", (event) => {
        event.preventDefault();
        showPage("ranking");
    });
});

document.querySelectorAll('a[href="#rutas"]').forEach((link) => {
    // Las rutas son públicas y se pueden ver como invitado.
    link.addEventListener("click", (event) => {
        event.preventDefault();
        showPage("route");
    });
});

document.querySelectorAll('a[href="#inicio"]').forEach((link) => {
    // El enlace de inicio vuelve a mostrar la portada.
    link.addEventListener("click", (event) => {
        event.preventDefault();
        showPage("home");
    });
});

/* =========================
    BLOQUE DE USUARIOS
    ========================= */
// Elementos del formulario de registro e inicio de sesión.
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
const routesContent = document.querySelector("#routes-content"); // Secciones privadas que solo se muestran si hay una sesión iniciada.
let authMode = "login"; // El formulario empieza en modo de inicio de sesión.

// Estos valores permiten que Chrome rellene los datos guardados por Google.
authName?.setAttribute("autocomplete", "name");
authEmail?.setAttribute("autocomplete", "username");
authPassword?.setAttribute("autocomplete", "current-password");

// Cambia el formulario entre iniciar sesión y crear una cuenta.
function setAuthMode(mode) {
    authMode = mode;
    authTabs.forEach((tab) => tab.classList.toggle("active", tab.dataset.tab === mode));
    nameField.hidden = mode !== "register";
    authName.required = mode === "register";
    authSubmit.textContent = mode === "register" ? "Crear cuenta" : "Iniciar sesión";
    formMessage.textContent = "";
}

function updateSignedInUser(user) {
    // Se cambia el nombre del botón y se muestra el contenido del usuario.
    accountLabel.textContent = user.name;
    profileName.textContent = user.name;
    profileEmail.textContent = user.email;
    profileBirth.value = user.birthDate || "";
    profileCity.value = user.city || "";
    // El botón de cerrar sesión solo aparece cuando hay un usuario conectado.
    logoutButton.hidden = false;
    authWall.classList.add("hidden");
    privateContent.classList.add("visible");
    routesWall.classList.add("hidden");
    routesContent.classList.add("visible");
}

/* =========================
    BLOQUE DEL PERFIL
    ========================= */
// Desde el perfil también se puede volver a la página de progreso.
profileProgress?.addEventListener("click", () => showPage("progress"));

// Guarda la fecha de nacimiento y la ciudad del usuario.
saveProfile?.addEventListener("click", () => {
    // Se recuperan los datos actuales antes de guardar los nuevos.
    const user = JSON.parse(localStorage.getItem("caceresgo-user") || "null");
    if (!user) return;
    user.birthDate = profileBirth.value;
    user.city = profileCity.value.trim();
    localStorage.setItem("caceresgo-user", JSON.stringify(user));
    profileMessage.textContent = "Datos guardados correctamente.";
});

// Para cambiar la contraseña se comprueba primero la contraseña actual.
passwordForm?.addEventListener("submit", (event) => {
    event.preventDefault();
    const user = JSON.parse(localStorage.getItem("caceresgo-user") || "null");
    if (!user || user.password !== currentPassword.value) {
        passwordMessage.textContent = "La contraseña actual no es correcta.";
        return;
    }
    if (newPassword.value !== repeatPassword.value) {
        passwordMessage.textContent = "Las nuevas contraseñas no coinciden.";
        return;
    }
    // La contraseña nueva sustituye a la anterior solo si todo es correcto.
    user.password = newPassword.value;
    localStorage.setItem("caceresgo-user", JSON.stringify(user));
    passwordForm.reset();
    passwordMessage.textContent = "Contraseña cambiada correctamente.";
});

/* La sesión solo se borra desde este botón. */
logoutButton?.addEventListener("click", () => {
    localStorage.removeItem("caceresgo-user");
    localStorage.removeItem("caceresgo-active-route");
    accountLabel.textContent = "Entrar / Registrarse";
    logoutButton.hidden = true;
    authWall.classList.remove("hidden");
    privateContent.classList.remove("visible");
    showPage("home");
});

authTabs.forEach((tab) => {
    // Al pulsar una pestaña cambia el tipo de formulario.
    tab.addEventListener("click", (event) => {
        event.preventDefault();
        authForm.reset();
        setAuthMode(tab.dataset.tab);
    });
});

authForm?.addEventListener("submit", (event) => {
    // Se comprueba el formulario y se guarda el usuario en el navegador.
    event.preventDefault();
    const email = authEmail.value.trim().toLowerCase();
    const password = authPassword.value;
    const savedUser = JSON.parse(localStorage.getItem("caceresgo-user") || "null");

    if (authMode === "register") {
        // Se guarda una cuenta sencilla para que el prototipo funcione sin servidor.
        const name = authName.value.trim();
        localStorage.setItem("caceresgo-user", JSON.stringify({ name, email, password }));
        updateSignedInUser({ name });
        authModal.classList.remove("open");
        authForm.reset();
        setAuthMode("login");
        return;
    }

    // Si los datos no coinciden, no se permite iniciar sesión.
    if (!savedUser || savedUser.email !== email || savedUser.password !== password) {
        formMessage.textContent = "El correo o la contraseña no son correctos.";
        return;
    }

    // Si los datos son correctos, se abre la parte privada de la página.
    updateSignedInUser(savedUser);
    authModal.classList.remove("open");
    authForm.reset();
});

const savedUser = JSON.parse(localStorage.getItem("caceresgo-user") || "null");
// Si ya había una sesión guardada, se recupera al cargar la página.
if (savedUser) updateSignedInUser(savedUser);

locateUser();
