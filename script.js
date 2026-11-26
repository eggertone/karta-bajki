// ======= JEDYNE MIEJSCE DO EDYCJI =======
// Wklej tu Production URL webhooka z n8n, zanim opublikujesz stronę na GitHub Pages.
const WEBHOOK_URL = "https://amy145-20145.mikrus.cloud/webhook/karta-bajki";
// Musi być identyczny jak wartość sprawdzana w node "Sekret poprawny?" w n8n.
const SEKRET = "815ce054dd97a8c9080ba6b4ae04a0057809f2db85aba27e88c8c5d3ba866e9a";
// =========================================
// Teksty zgód, wersja zgody i kontakt są w pliku config.js.

const TIMEOUT_MS = 30000;
const MOCK_DELAY_MS = 800;
const MIN_DZIECI = 1;
const MAX_DZIECI = 5;
const MIN_WIEK = 0;
const MAX_WIEK = 17;

// Dozwolone parametry adresu: ?k=KOD (neutralny kod rodziny) i ?mock=1 (tryb testowy).
// ?mock=blad symuluje błąd sieci przy pierwszej próbie wysłania (test przycisku "Spróbuj ponownie").
const params = new URLSearchParams(window.location.search);
const kodRaw = params.get("k") || "";
// Bez prawidłowego ?k= kod powstaje raz, przy otwarciu strony, i nie zmienia się przy ponawianiu wysyłki.
const kod = /^[A-Za-z0-9_-]{1,40}$/.test(kodRaw) ? kodRaw : generujKodRodziny();

// Format KB-XXXXXXXXXXXX. 32 znaki bez mylących 0, O, 1 i I; 32 dzieli 256, więc losowanie jest równomierne.
function generujKodRodziny() {
  const ALFABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bajty = new Uint8Array(12);
  crypto.getRandomValues(bajty);
  return "KB-" + Array.from(bajty, (b) => ALFABET[b % ALFABET.length]).join("");
}
const mockMode = params.get("mock");
const isMock = mockMode === "1" || mockMode === "blad";
let mockFailuresLeft = mockMode === "blad" ? 1 : 0;

const formView = document.getElementById("formView");
const doneView = document.getElementById("doneView");
const formEl = document.getElementById("kartaForm");
const childrenList = document.getElementById("childrenList");
const childTemplate = document.getElementById("childTemplate");
const addChildBtn = document.getElementById("addChildBtn");
const childrenLimit = document.getElementById("childrenLimit");
const errorSummary = document.getElementById("errorSummary");
const sendError = document.getElementById("sendError");
const retryBtn = document.getElementById("retryBtn");
const submitBtn = document.getElementById("submitBtn");
const printBtn = document.getElementById("printBtn");

const zgoda1El = document.getElementById("zgoda1");
const zgoda2El = document.getElementById("zgoda2");
const potwierdzenieEl = document.getElementById("potwierdzenie");
const rodzicEl = document.getElementById("rodzicImie");
const pulapkaEl = document.getElementById("polePulapka");

let sending = false;
let childCounter = 0;

// ===== Teksty z config.js (zawsze przez textContent, nigdy innerHTML) =====

function setText(id, text) {
  document.getElementById(id).textContent = text;
}

function fillStaticTexts() {
  setText("zgoda1Text", CONSENT_TEXT_1);
  setText("zgoda2Text", CONSENT_TEXT_2);
  setText("withdrawalText", WITHDRAWAL_TEXT);
  setText("potwierdzenieText", PARENT_CONFIRMATION_TEXT);
  setText("retentionText", RETENTION_TEXT);
  setText("contactText", CONTACT);
  document.querySelectorAll(".version-text").forEach((el) => {
    el.textContent = CONSENT_VERSION;
  });
  if (isMock) document.getElementById("mockBadge").hidden = false;
}

function formatDataCzas(date) {
  const pad = (n) => String(n).padStart(2, "0");
  return (
    pad(date.getDate()) + "." + pad(date.getMonth() + 1) + "." + date.getFullYear() +
    ", " + pad(date.getHours()) + ":" + pad(date.getMinutes())
  );
}

function updateClientNow() {
  setText("clientNow", formatDataCzas(new Date()));
}

// ===== Dynamiczna lista dzieci =====

function getChildRows() {
  return Array.from(childrenList.querySelectorAll(".child"));
}

function renumberChildren() {
  const rows = getChildRows();
  rows.forEach((row, index) => {
    const title = "Dziecko " + (index + 1);
    const titleEl = row.querySelector(".child-title");
    titleEl.textContent = title;
    row.setAttribute("aria-labelledby", titleEl.id);
    const removeBtn = row.querySelector(".btn-remove");
    removeBtn.hidden = rows.length <= MIN_DZIECI;
    removeBtn.setAttribute("aria-label", "Usuń: " + title);
  });
  const full = rows.length >= MAX_DZIECI;
  addChildBtn.hidden = full;
  childrenLimit.hidden = !full;
}

function addChild(focus) {
  if (getChildRows().length >= MAX_DZIECI) return;
  childCounter += 1;
  const fragment = childTemplate.content.cloneNode(true);
  const row = fragment.querySelector(".child");
  const prefix = "dziecko" + childCounter + "_";

  row.querySelector(".child-title").id = prefix + "tytul";
  row.querySelectorAll("[data-field]").forEach((input) => {
    input.id = prefix + input.dataset.field;
  });
  row.querySelectorAll("[data-for]").forEach((label) => {
    label.htmlFor = prefix + label.dataset.for;
  });
  row.querySelectorAll("[data-error]").forEach((err) => {
    err.id = prefix + err.dataset.error + "_blad";
  });
  ["imie", "wiek"].forEach((field) => {
    row.querySelector('[data-field="' + field + '"]').setAttribute("aria-describedby", prefix + field + "_blad");
  });

  row.querySelector(".btn-remove").addEventListener("click", () => removeChild(row));
  childrenList.appendChild(fragment);
  renumberChildren();
  if (focus) document.getElementById(prefix + "imie").focus();
}

function removeChild(row) {
  const rows = getChildRows();
  if (rows.length <= MIN_DZIECI) return;
  const index = rows.indexOf(row);
  row.remove();
  renumberChildren();
  const remaining = getChildRows();
  const target = remaining[Math.max(0, index - 1)];
  if (target) target.querySelector('[data-field="imie"]').focus();
}

// ===== Walidacja =====

function showFieldError(input, errorEl, message) {
  input.setAttribute("aria-invalid", "true");
  errorEl.textContent = message;
  errorEl.hidden = false;
}

function clearErrors() {
  formEl.querySelectorAll("[aria-invalid]").forEach((el) => el.removeAttribute("aria-invalid"));
  formEl.querySelectorAll(".field-error").forEach((el) => {
    el.textContent = "";
    el.hidden = true;
  });
  errorSummary.hidden = true;
  errorSummary.textContent = "";
}

function readChild(row) {
  const value = (field) => row.querySelector('[data-field="' + field + '"]').value.trim();
  return {
    imie: value("imie"),
    wiek: value("wiek"),
    co_lubi: value("co_lubi"),
    ulubiona_zabawka: value("ulubiona_zabawka"),
    ulubiona_maskotka: value("ulubiona_maskotka")
  };
}

function validate() {
  clearErrors();
  const errors = [];

  getChildRows().forEach((row, index) => {
    const child = readChild(row);
    const label = "Dziecko " + (index + 1);
    const imieEl = row.querySelector('[data-field="imie"]');
    const wiekEl = row.querySelector('[data-field="wiek"]');

    if (!child.imie) {
      showFieldError(imieEl, row.querySelector('[data-error="imie"]'), "Wpisz imię dziecka.");
      errors.push({ el: imieEl, text: label + ": brak imienia." });
    }
    const wiekOk = /^\d{1,2}$/.test(child.wiek) && Number(child.wiek) >= MIN_WIEK && Number(child.wiek) <= MAX_WIEK;
    if (!wiekOk) {
      showFieldError(wiekEl, row.querySelector('[data-error="wiek"]'), "Wpisz wiek jako liczbę od 0 do 17.");
      errors.push({ el: wiekEl, text: label + ": wiek musi być liczbą od 0 do 17." });
    }
  });

  if (!zgoda1El.checked) {
    showFieldError(zgoda1El, document.getElementById("zgoda1Error"), "Bez tej zgody nie mogę przygotować bajki.");
    errors.push({ el: zgoda1El, text: "Zaznacz zgodę wymaganą." });
  }
  if (!potwierdzenieEl.checked) {
    showFieldError(potwierdzenieEl, document.getElementById("potwierdzenieError"), "Zaznacz potwierdzenie.");
    errors.push({ el: potwierdzenieEl, text: "Potwierdź, że jesteś rodzicem lub opiekunem prawnym." });
  }
  if (!rodzicEl.value.trim()) {
    showFieldError(rodzicEl, document.getElementById("rodzicImieError"), "Wpisz swoje imię i nazwisko.");
    errors.push({ el: rodzicEl, text: "Wpisz imię i nazwisko rodzica lub opiekuna." });
  }
  if (pulapkaEl.value !== "") {
    errors.push({ el: submitBtn, text: "Nie udało się zweryfikować formularza. Odśwież stronę i spróbuj ponownie." });
  }

  if (errors.length) {
    const heading = document.createElement("p");
    heading.textContent = "Popraw zaznaczone pola:";
    const list = document.createElement("ul");
    errors.forEach((error) => {
      const item = document.createElement("li");
      item.textContent = error.text;
      list.appendChild(item);
    });
    errorSummary.append(heading, list);
    errorSummary.hidden = false;
    errors[0].el.focus();
    errors[0].el.scrollIntoView({ block: "center" });
  }
  return errors.length === 0;
}

// ===== Dane do wysłania =====

async function sha256Hex(text) {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function buildPayload() {
  const consentHash = await sha256Hex(CONSENT_TEXT_1 + CONSENT_TEXT_2 + WITHDRAWAL_TEXT + RETENTION_TEXT);
  return {
    sekret: SEKRET,
    kod,
    consent_version: CONSENT_VERSION,
    consent_hash: consentHash,
    imie_nazwisko_rodzica: rodzicEl.value.trim(),
    dzieci: getChildRows().map((row) => {
      const child = readChild(row);
      return { ...child, wiek: Number(child.wiek) };
    }),
    dodatkowe: {
      ulubione_zwierze: document.getElementById("extraZwierze").value.trim(),
      ulubione_miejsce: document.getElementById("extraMiejsce").value.trim(),
      cos_smiesznego: document.getElementById("extraSmieszne").value.trim()
    },
    zgoda1: zgoda1El.checked,
    zgoda2: zgoda2El.checked,
    potwierdzenie_rodzic: potwierdzenieEl.checked,
    pole_pulapka: pulapkaEl.value
  };
}

async function postPayload(payload) {
  if (isMock) {
    console.info("[mock] Do webhooka poszłoby:", { ...payload, sekret: "(ukryty)" });
    await new Promise((resolve) => setTimeout(resolve, MOCK_DELAY_MS));
    if (mockFailuresLeft > 0) {
      mockFailuresLeft -= 1;
      throw new Error("[mock] Symulowany błąd sieci.");
    }
    return;
  }

  if (!/^https:\/\//.test(WEBHOOK_URL)) {
    throw new Error("Brak konfiguracji: wpisz WEBHOOK_URL (https://...) na górze script.js.");
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      credentials: "omit",
      referrerPolicy: "no-referrer",
      cache: "no-store",
      signal: controller.signal
    });
    let data = null;
    try {
      data = await response.json();
    } catch (err) {
      data = null;
    }
    // Jedyna poprawna odpowiedź to {"ok": true}. Wszystko inne to błąd.
    if (!response.ok || !data || data.ok !== true) {
      throw new Error("Zła odpowiedź serwera: " + response.status);
    }
  } finally {
    clearTimeout(timeoutId);
  }
}

function setSending(busy) {
  sending = busy;
  submitBtn.disabled = busy;
  retryBtn.disabled = busy;
  submitBtn.textContent = busy ? "Wysyłam..." : "Wyślij kartę";
  formEl.setAttribute("aria-busy", busy ? "true" : "false");
}

async function submitKarta() {
  if (sending) return;
  sendError.hidden = true;
  if (!validate()) return;

  setSending(true);
  try {
    const payload = await buildPayload();
    await postPayload(payload);
    setSending(false);
    showDone(payload, new Date());
  } catch (err) {
    console.error("Błąd wysyłania karty:", err);
    setSending(false);
    sendError.hidden = false;
    retryBtn.focus();
  }
}

// ===== Ekran potwierdzenia =====

function addSummaryRow(dl, term, value) {
  const dt = document.createElement("dt");
  dt.textContent = term;
  const dd = document.createElement("dd");
  dd.textContent = value || "–";
  dl.append(dt, dd);
}

function showDone(payload, sentAt) {
  setText("sumRodzic", payload.imie_nazwisko_rodzica);
  setText("sumData", formatDataCzas(sentAt));
  setText("sumKod", payload.kod || "–");

  const list = document.getElementById("sumDzieci");
  list.textContent = "";
  payload.dzieci.forEach((child) => {
    const item = document.createElement("li");
    const dl = document.createElement("dl");
    dl.className = "summary";
    addSummaryRow(dl, "Imię", child.imie);
    addSummaryRow(dl, "Wiek", String(child.wiek));
    addSummaryRow(dl, "Co lubi", child.co_lubi);
    addSummaryRow(dl, "Ulubiona zabawka", child.ulubiona_zabawka);
    addSummaryRow(dl, "Opis maskotki lub zabawki", child.ulubiona_maskotka);
    item.appendChild(dl);
    list.appendChild(item);
  });

  const extra = document.getElementById("sumDodatkowe");
  extra.textContent = "";
  addSummaryRow(extra, "Ulubione zwierzę", payload.dodatkowe.ulubione_zwierze);
  addSummaryRow(extra, "Ulubione miejsce", payload.dodatkowe.ulubione_miejsce);
  addSummaryRow(extra, "Coś śmiesznego", payload.dodatkowe.cos_smiesznego);

  setText("sumZgoda1", "Zgoda wymagana: TAK");
  setText("sumZgoda1Text", CONSENT_TEXT_1);
  setText("sumZgoda2", "Zgoda dobrowolna: " + (payload.zgoda2 ? "TAK" : "NIE"));
  setText("sumZgoda2Text", CONSENT_TEXT_2);
  setText("sumPotwierdzenie", PARENT_CONFIRMATION_TEXT + " TAK");
  setText("sumWithdrawal", WITHDRAWAL_TEXT);
  setText("sumRetention", RETENTION_TEXT);

  formView.hidden = true;
  doneView.hidden = false;
  window.scrollTo(0, 0);
  document.getElementById("doneHeading").focus();
}

// ===== Zdarzenia =====

formEl.addEventListener("submit", (event) => {
  event.preventDefault();
  submitKarta();
});
retryBtn.addEventListener("click", submitKarta);
addChildBtn.addEventListener("click", () => addChild(true));
printBtn.addEventListener("click", () => window.print());

// Błąd przy polu znika, gdy użytkownik zaczyna je poprawiać.
formEl.addEventListener("input", (event) => {
  const el = event.target;
  if (el.getAttribute("aria-invalid") !== "true") return;
  el.removeAttribute("aria-invalid");
  const errorId = (el.getAttribute("aria-describedby") || "").split(" ").find((id) => /(Error|_blad)$/.test(id));
  const errorEl = errorId && document.getElementById(errorId);
  if (errorEl) errorEl.hidden = true;
});

fillStaticTexts();
updateClientNow();
setInterval(updateClientNow, 30000);
addChild(false);
