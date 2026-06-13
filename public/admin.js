const tokenKey = "vr-admin-token";
const loginPanel = document.querySelector("#login-panel");
const dashboard = document.querySelector("#dashboard");
const loginForm = document.querySelector("#login-form");
const loginMessage = document.querySelector("#login-message");
const adminMessage = document.querySelector("#admin-message");
const logoutButton = document.querySelector("#logout-button");

const settingsForm = document.querySelector("#settings-form");
const deviceAddForm = document.querySelector("#device-add-form");
const slotAddForm = document.querySelector("#slot-add-form");
const reservationAddForm = document.querySelector("#reservation-add-form");
const deviceList = document.querySelector("#device-list");
const slotAdminList = document.querySelector("#slot-admin-list");
const reservationList = document.querySelector("#reservation-list");
const reservationCount = document.querySelector("#reservation-count");
const newReservationSlot = document.querySelector("#new-reservation-slot");

const settingTitle = document.querySelector("#setting-title");
const settingDate = document.querySelector("#setting-date");
const settingVenue = document.querySelector("#setting-venue");
const settingDescription = document.querySelector("#setting-description");

let state = null;

function token() {
  return localStorage.getItem(tokenKey);
}

function showLogin() {
  loginPanel.classList.remove("hidden");
  dashboard.classList.add("hidden");
}

function showDashboard() {
  loginPanel.classList.add("hidden");
  dashboard.classList.remove("hidden");
}

function setMessage(target, message, isError = false) {
  target.textContent = message || "";
  target.classList.toggle("error", isError);
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token()}`,
      ...(options.headers || {}),
    },
  });
  const data = await response.json();
  if (!response.ok) {
    if (response.status === 401) {
      localStorage.removeItem(tokenKey);
      showLogin();
    }
    throw new Error(data.error || "Action impossible.");
  }
  return data;
}

function optionList(selectedSlotId) {
  return state.slots
    .map(
      (slot) =>
        `<option value="${escapeHtml(slot.id)}" ${slot.id === selectedSlotId ? "selected" : ""}>${escapeHtml(slot.label)}</option>`,
    )
    .join("");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function renderSettings() {
  settingTitle.value = state.settings.eventTitle || "";
  settingDate.value = state.settings.eventDate || "";
  settingVenue.value = state.settings.venue || "";
  settingDescription.value = state.settings.description || "";
}

function renderDevices() {
  deviceList.innerHTML = "";
  if (!state.devices.length) {
    deviceList.innerHTML =
      '<p class="empty-state">Aucun casque ajoute pour le moment.</p>';
    return;
  }

  state.devices.forEach((device) => {
    const row = document.createElement("form");
    row.className = "admin-row device-row";
    row.dataset.id = device.id;
    row.innerHTML = `
      <input name="name" value="${escapeHtml(device.name)}" maxlength="60" aria-label="Nom du casque" />
      <label class="toggle-label">
        <input name="active" type="checkbox" ${device.active ? "checked" : ""} />
        Actif
      </label>
      <button class="icon-button" type="button" data-action="delete-device" title="Supprimer">×</button>
    `;
    deviceList.append(row);
  });
}

function renderSlots() {
  slotAdminList.innerHTML = "";
  if (!state.slots.length) {
    slotAdminList.innerHTML =
      '<p class="empty-state">Aucun creneau ajoute pour le moment.</p>';
    return;
  }

  state.slots.forEach((slot) => {
    const row = document.createElement("form");
    row.className = "admin-row";
    row.dataset.id = slot.id;
    row.innerHTML = `
      <input name="label" value="${escapeHtml(slot.label)}" maxlength="60" aria-label="Libelle du creneau" />
      <input name="capacity" type="number" min="1" max="50" value="${Number(slot.capacity)}" aria-label="Places" />
      <label class="toggle-label">
        <input name="active" type="checkbox" ${slot.active ? "checked" : ""} />
        Visible
      </label>
      <button class="icon-button" type="button" data-action="delete-slot" title="Supprimer">×</button>
    `;
    slotAdminList.append(row);
  });
}

function renderReservations() {
  reservationList.innerHTML = "";
  reservationCount.textContent = state.reservations.length;
  newReservationSlot.innerHTML = optionList();

  if (!state.reservations.length) {
    reservationList.innerHTML =
      '<p class="empty-state">Aucune reservation pour le moment.</p>';
    return;
  }

  state.reservations.forEach((reservation) => {
    const row = document.createElement("form");
    row.className = "reservation-row";
    row.dataset.id = reservation.id;
    row.innerHTML = `
      <input name="firstName" value="${escapeHtml(reservation.firstName)}" maxlength="40" aria-label="Prenom" />
      <input name="lastName" value="${escapeHtml(reservation.lastName)}" maxlength="40" aria-label="Nom" />
      <select name="slotId" aria-label="Creneau">${optionList(reservation.slotId)}</select>
      <select name="status" aria-label="Statut">
        <option value="reserved" ${reservation.status !== "checked-in" ? "selected" : ""}>Reserve</option>
        <option value="checked-in" ${reservation.status === "checked-in" ? "selected" : ""}>Arrive</option>
      </select>
      <button class="save-button" type="submit">OK</button>
      <button class="icon-button" type="button" data-action="delete-reservation" title="Supprimer">×</button>
    `;
    reservationList.append(row);
  });
}

function renderAll() {
  renderSettings();
  renderDevices();
  renderSlots();
  renderReservations();
}

async function loadState() {
  state = await api("/api/admin/state");
  showDashboard();
  renderAll();
}

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  setMessage(loginMessage, "");

  try {
    const password = new FormData(loginForm).get("password");
    const response = await fetch("/api/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Connexion impossible.");

    localStorage.setItem(tokenKey, data.token);
    loginForm.reset();
    await loadState();
  } catch (error) {
    setMessage(loginMessage, error.message, true);
  }
});

logoutButton.addEventListener("click", () => {
  localStorage.removeItem(tokenKey);
  showLogin();
});

settingsForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    await api("/api/admin/settings", {
      method: "PUT",
      body: JSON.stringify({
        eventTitle: settingTitle.value,
        eventDate: settingDate.value,
        venue: settingVenue.value,
        description: settingDescription.value,
      }),
    });
    setMessage(adminMessage, "Infos enregistrees.");
    await loadState();
  } catch (error) {
    setMessage(adminMessage, error.message, true);
  }
});

deviceAddForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    const name = document.querySelector("#new-device-name").value;
    await api("/api/admin/devices", {
      method: "POST",
      body: JSON.stringify({ name, active: true }),
    });
    deviceAddForm.reset();
    await loadState();
  } catch (error) {
    setMessage(adminMessage, error.message, true);
  }
});

slotAddForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    await api("/api/admin/slots", {
      method: "POST",
      body: JSON.stringify({
        label: document.querySelector("#new-slot-label").value,
        capacity: document.querySelector("#new-slot-capacity").value,
        active: true,
      }),
    });
    slotAddForm.reset();
    document.querySelector("#new-slot-capacity").value = 3;
    await loadState();
  } catch (error) {
    setMessage(adminMessage, error.message, true);
  }
});

reservationAddForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    const response = await fetch("/api/reservations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        firstName: document.querySelector("#new-reservation-first-name").value,
        lastName: document.querySelector("#new-reservation-last-name").value,
        slotId: newReservationSlot.value,
      }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Ajout impossible.");
    reservationAddForm.reset();
    await loadState();
  } catch (error) {
    setMessage(adminMessage, error.message, true);
  }
});

deviceList.addEventListener("change", async (event) => {
  const row = event.target.closest("form");
  if (!row) return;
  const data = new FormData(row);
  await api(`/api/admin/devices/${row.dataset.id}`, {
    method: "PUT",
    body: JSON.stringify({
      name: data.get("name"),
      active: data.get("active") === "on",
    }),
  });
  await loadState();
});

deviceList.addEventListener("submit", async (event) => {
  event.preventDefault();
  const row = event.target.closest("form");
  const data = new FormData(row);
  await api(`/api/admin/devices/${row.dataset.id}`, {
    method: "PUT",
    body: JSON.stringify({
      name: data.get("name"),
      active: data.get("active") === "on",
    }),
  });
  await loadState();
});

slotAdminList.addEventListener("change", async (event) => {
  const row = event.target.closest("form");
  if (!row) return;
  const data = new FormData(row);
  await api(`/api/admin/slots/${row.dataset.id}`, {
    method: "PUT",
    body: JSON.stringify({
      label: data.get("label"),
      capacity: data.get("capacity"),
      active: data.get("active") === "on",
    }),
  });
  await loadState();
});

slotAdminList.addEventListener("submit", async (event) => {
  event.preventDefault();
  const row = event.target.closest("form");
  const data = new FormData(row);
  await api(`/api/admin/slots/${row.dataset.id}`, {
    method: "PUT",
    body: JSON.stringify({
      label: data.get("label"),
      capacity: data.get("capacity"),
      active: data.get("active") === "on",
    }),
  });
  await loadState();
});

deviceList.addEventListener("click", async (event) => {
  if (event.target.dataset.action !== "delete-device") return;
  const row = event.target.closest("form");
  await api(`/api/admin/devices/${row.dataset.id}`, { method: "DELETE" });
  await loadState();
});

slotAdminList.addEventListener("click", async (event) => {
  if (event.target.dataset.action !== "delete-slot") return;
  const row = event.target.closest("form");
  try {
    await api(`/api/admin/slots/${row.dataset.id}`, { method: "DELETE" });
    await loadState();
  } catch (error) {
    setMessage(adminMessage, error.message, true);
  }
});

reservationList.addEventListener("submit", async (event) => {
  event.preventDefault();
  const row = event.target.closest("form");
  const data = new FormData(row);
  try {
    await api(`/api/admin/reservations/${row.dataset.id}`, {
      method: "PUT",
      body: JSON.stringify({
        firstName: data.get("firstName"),
        lastName: data.get("lastName"),
        slotId: data.get("slotId"),
        status: data.get("status"),
      }),
    });
    await loadState();
  } catch (error) {
    setMessage(adminMessage, error.message, true);
  }
});

reservationList.addEventListener("click", async (event) => {
  if (event.target.dataset.action !== "delete-reservation") return;
  const row = event.target.closest("form");
  await api(`/api/admin/reservations/${row.dataset.id}`, { method: "DELETE" });
  await loadState();
});

if (token()) {
  loadState().catch(() => showLogin());
} else {
  showLogin();
}
