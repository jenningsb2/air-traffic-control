"use strict";

const {
  COLORS, DEFAULT_SETTINGS, compileMatchPattern, destinationForName, normalizeGroupKey,
  normalizeGroupName, normalizeSettings
} = AirTraffic;
const colorHex = {
  grey: "#8f96a8", blue: "#4f79db", red: "#d65763", yellow: "#d9a22e", green: "#42a06d",
  pink: "#d9669e", purple: "#765bd7", cyan: "#39a5b5", orange: "#d87c3d"
};
const colorOrder = ["blue", "purple", "red", "green", "orange", "cyan", "pink", "yellow", "grey"];
const elements = {
  list: document.querySelector("#routeList"), template: document.querySelector("#routeTemplate"),
  empty: document.querySelector("#emptyState"), status: document.querySelector("#saveStatus")
};
let routes = [];
let destinations = [];
let browserGroups = [];
let dirty = false;

function makeId() {
  return crypto.randomUUID ? crypto.randomUUID() : `route-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
function domainFromPattern(pattern) {
  const match = /^\*:\/\/\*\.([^/*]+)\/\*$/.exec(pattern);
  return match ? match[1] : null;
}
function patternFromDomain(value) {
  const domain = value.trim().replace(/^https?:\/\//i, "").replace(/^www\./i, "").split(/[/?#]/)[0];
  if (!domain || !domain.includes(".") || /[\s*]/.test(domain)) throw new Error("Enter a domain like example.com");
  return `*://*.${domain}/*`;
}
function setDirty(value = true) {
  dirty = value;
  elements.status.textContent = value ? "Unsaved changes" : "All changes saved";
  elements.status.className = `save-status ${value ? "dirty" : "saved"}`;
}
function validateCondition(input, error, mode) {
  try {
    if (mode === "domain") patternFromDomain(input.value);
    else compileMatchPattern(input.value);
    input.closest(".field").classList.remove("invalid");
    error.textContent = "";
    return true;
  } catch (reason) {
    input.closest(".field").classList.add("invalid");
    error.textContent = reason.message;
    return false;
  }
}
function candidateDestinations() {
  const result = destinations.map((destination) => ({ ...destination, source: "saved" }));
  const keys = new Set(result.map((destination) => normalizeGroupKey(destination.name)));
  browserGroups.forEach((group) => {
    const key = normalizeGroupKey(group.name);
    if (key && !keys.has(key)) {
      keys.add(key);
      result.push({ ...group, source: "open" });
    }
  });
  return result.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
}
function chooseNewColor() {
  const counts = Object.fromEntries(COLORS.map((color) => [color, 0]));
  destinations.forEach((destination) => { counts[destination.color] += 1; });
  return colorOrder.reduce((best, color) => counts[color] < counts[best] ? color : best, colorOrder[0]);
}
function ensureDestination(candidate) {
  const existing = destinationForName(destinations, candidate.name);
  if (existing) return existing;
  const destination = { name: normalizeGroupName(candidate.name), color: candidate.color || chooseNewColor() };
  destinations.push(destination);
  return destination;
}
function closePicker(item) {
  const input = item.querySelector(".group-input");
  item.querySelector(".picker-menu").hidden = true;
  input.setAttribute("aria-expanded", "false");
  input.removeAttribute("aria-activedescendant");
}
function renderPickerMenu(item, route, showAll = false) {
  const input = item.querySelector(".group-input");
  const menu = item.querySelector(".picker-menu");
  const typedName = normalizeGroupName(input.value);
  const typedKey = normalizeGroupKey(typedName);
  const allCandidates = candidateDestinations();
  const candidates = allCandidates.filter((destination) => showAll || !typedKey || normalizeGroupKey(destination.name).includes(typedKey));
  const exact = allCandidates.find((destination) => normalizeGroupKey(destination.name) === typedKey);
  menu.replaceChildren();

  const selectDestination = (candidate) => {
    const destination = ensureDestination(candidate);
    route.groupName = destination.name;
    input.value = destination.name;
    item.querySelector(".group-picker").classList.remove("invalid");
    closePicker(item);
    setDirty();
  };

  candidates.forEach((destination, index) => {
    const row = document.createElement("div");
    row.className = "picker-row";
    const option = document.createElement("button");
    option.type = "button";
    option.className = "picker-option";
    option.tabIndex = -1;
    option.id = `${input.id}-option-${index}`;
    option.setAttribute("role", "option");
    option.innerHTML = `<span class="option-dot" style="--dot-color:${colorHex[destination.color]}"></span><span></span><small>${destination.source === "open" ? "Open group" : "Destination"}</small>`;
    option.querySelector("span:nth-child(2)").textContent = destination.name;
    option.addEventListener("mousedown", (event) => event.preventDefault());
    option.addEventListener("click", () => selectDestination(destination));
    row.append(option);

    if (destination.source === "saved") {
      const usageCount = routes.filter((item) => normalizeGroupKey(item.groupName) === normalizeGroupKey(destination.name)).length;
      const deleteButton = document.createElement("button");
      deleteButton.type = "button";
      deleteButton.className = `destination-delete${usageCount ? " blocked" : ""}`;
      deleteButton.textContent = "×";
      deleteButton.title = usageCount
        ? `Remove from ${usageCount} ${usageCount === 1 ? "route" : "routes"} first`
        : `Delete “${destination.name}” destination`;
      deleteButton.setAttribute("aria-label", usageCount
        ? `Can’t delete “${destination.name}” destination. Remove it from ${usageCount} ${usageCount === 1 ? "route" : "routes"} first.`
        : `Delete “${destination.name}” destination`);
      deleteButton.setAttribute("aria-disabled", String(usageCount > 0));
      deleteButton.addEventListener("mousedown", (event) => event.preventDefault());
      deleteButton.addEventListener("click", (event) => {
        event.stopPropagation();
        if (usageCount) return;
        destinations = destinations.filter((item) => normalizeGroupKey(item.name) !== normalizeGroupKey(destination.name));
        setDirty();
        renderPickerMenu(item, route, showAll);
        input.focus();
      });
      row.classList.add("has-delete");
      row.append(deleteButton);
    }
    menu.append(row);
  });
  if (typedName && !exact) {
    const create = document.createElement("button");
    create.type = "button";
    create.className = "picker-option create-option";
    create.id = `${input.id}-create`;
    create.setAttribute("role", "option");
    create.textContent = `+ Create “${typedName}”`;
    create.addEventListener("mousedown", (event) => event.preventDefault());
    create.addEventListener("click", () => selectDestination({ name: typedName, color: chooseNewColor() }));
    menu.append(create);
  }
  if (!menu.children.length) {
    const empty = document.createElement("div");
    empty.className = "picker-empty";
    empty.textContent = "Type a group name";
    menu.append(empty);
  }
  menu.hidden = false;
  input.setAttribute("aria-expanded", "true");
}
function bindPicker(item, route, index) {
  const input = item.querySelector(".group-input");
  const menu = item.querySelector(".picker-menu");
  input.id = `group-input-${index}`;
  input.setAttribute("aria-controls", `group-menu-${index}`);
  menu.id = `group-menu-${index}`;
  let activeIndex = -1;
  input.addEventListener("focus", () => { activeIndex = -1; renderPickerMenu(item, route); });
  input.addEventListener("input", () => {
    route.groupName = input.value;
    const exact = candidateDestinations().find((destination) => normalizeGroupKey(destination.name) === normalizeGroupKey(input.value));
    if (exact) {
      const destination = ensureDestination(exact);
      route.groupName = destination.name;
      item.querySelector(".group-picker").classList.remove("invalid");
    }
    activeIndex = -1;
    renderPickerMenu(item, route);
    setDirty();
  });
  input.addEventListener("keydown", (event) => {
    let options = [...menu.querySelectorAll(".picker-option")];
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (menu.hidden) {
        renderPickerMenu(item, route);
        options = [...menu.querySelectorAll(".picker-option")];
      }
      if (!options.length) return;
      const direction = event.key === "ArrowDown" ? 1 : -1;
      activeIndex = (activeIndex + direction + options.length) % options.length;
      options.forEach((option, optionIndex) => option.classList.toggle("active", optionIndex === activeIndex));
      const active = options[activeIndex];
      if (active) input.setAttribute("aria-activedescendant", active.id);
    } else if (event.key === "Enter" && activeIndex >= 0) {
      event.preventDefault(); options[activeIndex]?.click();
    } else if (event.key === "Escape") closePicker(item);
  });
  input.addEventListener("blur", () => {
    window.setTimeout(() => {
      if (menu.contains(document.activeElement)) return;
      closePicker(item);
      const destination = destinationForName(destinations, route.groupName);
      item.querySelector(".group-picker").classList.toggle("invalid", !destination);
    }, 0);
  });
  item.querySelector(".picker-toggle").addEventListener("click", () => {
    if (menu.hidden) { input.focus(); renderPickerMenu(item, route, true); }
    else closePicker(item);
  });
}
function render() {
  elements.list.replaceChildren();
  elements.empty.hidden = routes.length > 0;
  routes.forEach((route, index) => {
    const item = elements.template.content.firstElementChild.cloneNode(true);
    item.dataset.id = route.id;
    item.classList.toggle("disabled", !route.enabled);
    const condition = item.querySelector(".condition-select");
    const pattern = item.querySelector(".pattern-input");
    const group = item.querySelector(".group-input");
    const enabled = item.querySelector(".enabled-input");
    const error = item.querySelector(".pattern-field .field-error");
    const simpleDomain = domainFromPattern(route.pattern);
    condition.value = simpleDomain ? "domain" : "pattern";
    pattern.value = simpleDomain || route.pattern;
    pattern.placeholder = simpleDomain ? "example.com" : "*://*.example.com/*";
    group.value = route.groupName;
    enabled.checked = route.enabled;
    item.querySelector(".move-up").disabled = index === 0;
    item.querySelector(".move-down").disabled = index === routes.length - 1;
    condition.addEventListener("change", () => {
      if (condition.value === "domain") {
        pattern.value = domainFromPattern(route.pattern) || "example.com";
        pattern.placeholder = "example.com";
      } else {
        try { route.pattern = patternFromDomain(pattern.value); } catch { route.pattern = "*://*.example.com/*"; }
        pattern.value = route.pattern;
        pattern.placeholder = "*://*.example.com/*";
      }
      validateCondition(pattern, error, condition.value); setDirty();
    });
    pattern.addEventListener("input", () => {
      if (condition.value === "pattern") route.pattern = pattern.value;
      else { try { route.pattern = patternFromDomain(pattern.value); } catch { route.pattern = pattern.value; } }
      validateCondition(pattern, error, condition.value); setDirty();
    });
    pattern.addEventListener("blur", () => validateCondition(pattern, error, condition.value));
    bindPicker(item, route, index);
    enabled.addEventListener("change", () => {
      route.enabled = enabled.checked; item.classList.toggle("disabled", !route.enabled); setDirty();
    });
    item.querySelector(".move-up").addEventListener("click", () => moveRoute(index, -1));
    item.querySelector(".move-down").addEventListener("click", () => moveRoute(index, 1));
    item.querySelector(".delete-button").addEventListener("click", () => { routes.splice(index, 1); render(); setDirty(); });
    elements.list.append(item);
  });
}
function moveRoute(index, delta) {
  const target = index + delta;
  if (target < 0 || target >= routes.length) return;
  [routes[index], routes[target]] = [routes[target], routes[index]];
  render(); setDirty();
  elements.list.children[target]?.querySelector(".pattern-input")?.focus();
}
function addRoute() {
  const destination = destinations[0] || ensureDestination({ name: "New group", color: chooseNewColor() });
  routes.push({ id: makeId(), pattern: "*://*.example.com/*", groupName: destination.name, enabled: true });
  render(); setDirty();
  elements.list.lastElementChild?.querySelector(".pattern-input")?.select();
}
async function save() {
  const items = [...elements.list.querySelectorAll(".route-item")];
  const conditionsValid = items.every((item) => validateCondition(item.querySelector(".pattern-input"), item.querySelector(".pattern-field .field-error"), item.querySelector(".condition-select").value));
  const groupsValid = routes.every((route) => destinationForName(destinations, route.groupName));
  items.forEach((item, index) => item.querySelector(".group-picker").classList.toggle("invalid", !destinationForName(destinations, routes[index].groupName)));
  if (!conditionsValid || !groupsValid) {
    elements.status.textContent = "Fix the highlighted route";
    elements.status.className = "save-status dirty";
    items.find((item, index) => !destinationForName(destinations, routes[index].groupName) || item.querySelector(".field.invalid"))?.querySelector("input")?.focus();
    return;
  }
  const settings = normalizeSettings({ routes, destinations });
  await chrome.storage.local.set({ settings });
  routes = structuredClone(settings.routes);
  destinations = structuredClone(settings.destinations);
  render(); setDirty(false);
}
async function loadBrowserGroups() {
  try {
    const currentWindow = await chrome.windows.getCurrent();
    const groups = await chrome.tabGroups.query({});
    groups.sort((a, b) => Number(b.windowId === currentWindow.id) - Number(a.windowId === currentWindow.id) || a.windowId - b.windowId || a.id - b.id);
    const keys = new Set();
    browserGroups = groups.filter((group) => {
      const key = normalizeGroupKey(group.title);
      if (!key || keys.has(key)) return false;
      keys.add(key); return true;
    }).map((group) => ({ name: normalizeGroupName(group.title), color: group.color }));
  } catch { browserGroups = []; }
}
async function load() {
  const [stored] = await Promise.all([chrome.storage.local.get("settings"), loadBrowserGroups()]);
  const settings = normalizeSettings(stored.settings || DEFAULT_SETTINGS);
  routes = structuredClone(settings.routes);
  destinations = structuredClone(settings.destinations);
  render(); setDirty(false);
}
document.querySelector("#addRoute").addEventListener("click", addRoute);
document.querySelector("[data-action='add']").addEventListener("click", addRoute);
document.querySelector("#saveButton").addEventListener("click", save);
document.querySelector("#restoreExamples").addEventListener("click", () => {
  const settings = normalizeSettings(DEFAULT_SETTINGS);
  routes = structuredClone(settings.routes); destinations = structuredClone(settings.destinations); render(); setDirty();
});
window.addEventListener("beforeunload", (event) => { if (dirty) event.preventDefault(); });
load();
