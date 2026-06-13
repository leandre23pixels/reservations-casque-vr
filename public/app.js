const form = document.querySelector("#reservation-form");
const slotList = document.querySelector("#slot-list");
const notice = document.querySelector("#notice");
const eventTitle = document.querySelector("#event-title");
const eventMeta = document.querySelector("#event-meta");
const eventDescription = document.querySelector("#event-description");

let slots = [];

function setNotice(message, isError = false) {
  notice.textContent = message || "";
  notice.classList.toggle("error", isError);
}

function slotCard(slot) {
  const full = slot.remaining <= 0;
  const label = document.createElement("label");
  label.className = `slot-card ${full ? "disabled" : "available"}`;

  const radio = document.createElement("input");
  radio.type = "radio";
  radio.name = "slotId";
  radio.value = slot.id;
  radio.required = true;
  radio.disabled = full;

  const title = document.createElement("span");
  title.className = "slot-label";
  title.textContent = slot.label;

  const places = document.createElement("span");
  places.className = "slot-places";
  places.textContent = `${slot.remaining} place${slot.remaining > 1 ? "s" : ""} restante${slot.remaining > 1 ? "s" : ""} sur ${slot.capacity}`;

  const status = document.createElement("span");
  status.className = "slot-status";
  status.textContent = full ? "Complet" : "Disponible";

  label.append(radio, title, places, status);
  return label;
}

function render(data) {
  const { settings } = data;
  slots = data.slots;

  eventTitle.textContent = settings.eventTitle || "Soiree casque VR";
  eventMeta.textContent = [settings.eventDate, settings.venue]
    .filter(Boolean)
    .join(" - ");
  eventDescription.textContent = settings.description || "";

  slotList.replaceChildren();
  if (!slots.length) {
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = "Aucun creneau disponible pour le moment.";
    slotList.append(empty);
    return;
  }

  slots.forEach((slot) => slotList.append(slotCard(slot)));
}

async function loadPublicState() {
  try {
    const response = await fetch("/api/public", { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Erreur de chargement.");
    render(data);
  } catch (error) {
    setNotice(
      "Impossible de joindre le serveur de reservations. Verifie qu'il est lance.",
      true,
    );
  }
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  setNotice("");

  const formData = new FormData(form);
  const payload = {
    firstName: formData.get("firstName"),
    lastName: formData.get("lastName"),
    slotId: formData.get("slotId"),
  };

  try {
    const response = await fetch("/api/reservations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Reservation impossible.");

    form.reset();
    setNotice(`Reservation confirmee pour ${data.slot.label}.`);
    await loadPublicState();
  } catch (error) {
    setNotice(error.message, true);
  }
});

loadPublicState();
setInterval(loadPublicState, 15000);
