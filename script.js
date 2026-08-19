/* ============================================================
   WeatherCheck — script.js
   Uses Open-Meteo (free, no API key) for geocoding + weather,
   and BigDataCloud (free, no API key) for reverse geocoding
   when the user clicks the location icon.

   Requires the HTML/CSS structure already provided:
   .city, .condition, .temp, .cw-meta, .cw-icon, .time-card .date,
   #clock, .search-box input, .header-icons svg (3 icons in order:
   location, settings, profile), #forecast, #conditions
   ============================================================ */

const state = {
  unit: "C",          // "C" or "F"
  lastData: null,     // last fetched weather payload (raw, Celsius)
  lastCity: "Chennai, Tamil Nadu",
  selectedLat: null,
  selectedLon: null,
  selectedLabel: null
};

/* ---------- DOM references ---------- */
const cityEl = document.querySelector(".city");
const conditionEl = document.querySelector(".condition");
const tempEl = document.querySelector(".temp");
const metaSpans = document.querySelectorAll(".cw-meta span");
const weatherIconEl = document.querySelector(".cw-icon");
const clockEl = document.getElementById("clock");
const dateEl = document.querySelector(".time-card .date");
const searchInput = document.querySelector(".search-box input");
const headerIcons = document.querySelectorAll(".header-icons svg");
const forecastEl = document.getElementById("forecast");
const conditionsEl = document.getElementById("conditions");
const autocompleteDropdown = document.getElementById("autocompleteDropdown");

/* ---------- Weather icon / label lookup (WMO codes) ---------- */
function getWeatherVisual(code) {
  const sun = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>`;
  const cloud = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.5 19H9a5 5 0 1 1 1.3-9.8A6 6 0 0 1 22 12a4.5 4.5 0 0 1-4.5 4.5"/></svg>`;
  const rain = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 13v8M8 13v8M12 15v8M20 16.58A5 5 0 0 0 18 7h-1.26A8 8 0 1 0 4 15.25"/></svg>`;
  const snow = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 16.58A5 5 0 0 0 18 7h-1.26A8 8 0 1 0 4 15.25"/><path d="M8 16h.01M12 18h.01M16 16h.01M12 14h.01"/></svg>`;
  const fog = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 8h18M5 12h14M3 16h18M7 20h10"/></svg>`;
  const storm = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 16.9A5 5 0 0 0 18 7h-1.26A8 8 0 1 0 4 15.25"/><path d="M13 11l-4 6h3l-1 4 5-6h-3l1-4z"/></svg>`;

  const map = {
    0: { icon: sun, label: "Clear Sky" },
    1: { icon: sun, label: "Mainly Clear" },
    2: { icon: cloud, label: "Partly Cloudy" },
    3: { icon: cloud, label: "Overcast" },
    45: { icon: fog, label: "Foggy" },
    48: { icon: fog, label: "Foggy" },
    51: { icon: rain, label: "Light Drizzle" },
    53: { icon: rain, label: "Drizzle" },
    55: { icon: rain, label: "Dense Drizzle" },
    61: { icon: rain, label: "Light Rain" },
    63: { icon: rain, label: "Rain" },
    65: { icon: rain, label: "Heavy Rain" },
    71: { icon: snow, label: "Light Snow" },
    73: { icon: snow, label: "Snow" },
    75: { icon: snow, label: "Heavy Snow" },
    80: { icon: rain, label: "Rain Showers" },
    81: { icon: rain, label: "Rain Showers" },
    82: { icon: rain, label: "Violent Showers" },
    95: { icon: storm, label: "Thunderstorm" },
    96: { icon: storm, label: "Thunderstorm" },
    99: { icon: storm, label: "Severe Thunderstorm" }
  };
  return map[code] || { icon: sun, label: "Clear" };
}

/* ---------- Helpers ---------- */
function cToF(c) { return (c * 9) / 5 + 32; }

function formatTemp(celsius) {
  const val = state.unit === "C" ? celsius : cToF(celsius);
  return `${Math.round(val)}°${state.unit}`;
}

function formatClockTime(date) {
  return date.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true });
}

function formatDateLong(date) {
  return date.toLocaleDateString("en-US", { weekday: "long", day: "numeric", month: "long" });
}

function formatDayLabel(dateStr, isToday) {
  if (isToday) return "TODAY";
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", { weekday: "short" }).toUpperCase();
}

/* ---------- Live clock (always real local time) ---------- */
function startClock() {
  function tick() {
    const now = new Date();
    clockEl.textContent = formatClockTime(now);
    dateEl.textContent = formatDateLong(now);
  }
  tick();
  setInterval(tick, 1000 * 30); // refresh every 30s, no need for per-second
}

/* ---------- Autocomplete Logic ---------- */
// User must replace this
let autocompleteCache = {};
let autocompleteAbortController = null;
let debounceTimeout = null;

async function fetchSuggestions(query) {
  if (autocompleteCache[query]) {
    renderSuggestions(autocompleteCache[query]);
    return;
  }

  if (autocompleteAbortController) {
    autocompleteAbortController.abort();
  }

  autocompleteAbortController = new AbortController();

  try {
    const url = `/api/cities?q=${encodeURIComponent(query)}`;

    const res = await fetch(url, {
      signal: autocompleteAbortController.signal
    });

    if (res.status === 429) {
      renderAutocompleteMessage(
        "Too many requests. Please wait a moment and try again."
      );
      return;
    }

    if (!res.ok) {
      throw new Error("API Error");
    }

    const data = await res.json();

    if (!data.data || data.data.length === 0) {
      renderAutocompleteMessage("No locations found.");
      return;
    }

    autocompleteCache[query] = data.data;
    renderSuggestions(data.data);

  } catch (err) {
    if (err.name !== "AbortError") {
      renderAutocompleteMessage("Unable to load locations.");
      console.error(err);
    }
  }
}

function renderAutocompleteMessage(msg) {
  autocompleteDropdown.style.display = "flex";
  autocompleteDropdown.innerHTML = `<div class="autocomplete-msg">${msg}</div>`;
}

function renderSuggestions(cities) {
  autocompleteDropdown.innerHTML = "";
  if (cities.length === 0) {
    autocompleteDropdown.style.display = "none";
    return;
  }

  autocompleteDropdown.style.display = "flex";
  cities.forEach(city => {
    const div = document.createElement("div");
    div.className = "autocomplete-item";
    const regionText = [city.region, city.country].filter(Boolean).join(", ");
    div.innerHTML = `
      <div class="ac-city">📍 ${city.city}</div>
      <div class="ac-region">${regionText}</div>
    `;
    div.addEventListener("click", () => {
      searchInput.value = city.city;
      state.selectedLat = city.latitude;
      state.selectedLon = city.longitude;
      state.selectedLabel = [city.city, city.region, city.country].filter(Boolean).join(", ");
      autocompleteDropdown.style.display = "none";
      loadSelectedCity();
    });
    autocompleteDropdown.appendChild(div);
  });
}

/* ---------- Geocoding: city name -> lat/lon ---------- */
async function geocodeCity(name) {
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(name)}&count=1&language=en&format=json`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("Geocoding request failed");
  const data = await res.json();
  if (!data.results || data.results.length === 0) throw new Error("City not found");
  const r = data.results[0];
  return {
    lat: r.latitude,
    lon: r.longitude,
    label: [r.name, r.admin1, r.country].filter(Boolean).join(", ")
  };
}

/* ---------- Reverse geocoding: lat/lon -> city name (for "use my location") ---------- */
async function reverseGeocode(lat, lon) {
  const url = `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=en`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("Reverse geocoding failed");
  const data = await res.json();
  const city = data.city || data.locality || "Your Location";
  const region = data.principalSubdivision || "";
  return [city, region].filter(Boolean).join(", ");
}

/* ---------- Fetch weather for coordinates ---------- */
async function fetchWeather(lat, lon) {
  const url = `https://api.open-meteo.com/v1/forecast` +
    `?latitude=${lat}&longitude=${lon}` +
    `&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m,surface_pressure` +
    `&hourly=visibility` +
    `&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunrise,sunset,uv_index_max` +
    `&timezone=auto&forecast_days=7`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("Weather request failed");
  return res.json();
}

/* ---------- Render current weather card ---------- */
function renderCurrent(cityLabel, data) {
  const current = data.current;
  const visual = getWeatherVisual(current.weather_code);

  cityEl.textContent = cityLabel;
  conditionEl.textContent = visual.label;
  tempEl.textContent = formatTemp(current.temperature_2m);
  weatherIconEl.innerHTML = visual.icon;

  const feels = state.unit === "C" ? Math.round(current.apparent_temperature) : Math.round(cToF(current.apparent_temperature));
  metaSpans[0].innerHTML = `🌡️ Feels like ${feels}°${state.unit}`;
  metaSpans[1].innerHTML = `💧 Humidity ${Math.round(current.relative_humidity_2m)}%`;
  metaSpans[2].innerHTML = `💨 Wind ${Math.round(current.wind_speed_10m)}km/h`;
}

/* ---------- Render 7-day forecast ---------- */
function renderForecast(data) {
  forecastEl.innerHTML = "";
  const daily = data.daily;

  daily.time.forEach((dateStr, i) => {
    const isToday = i === 0;
    const visual = getWeatherVisual(daily.weather_code[i]);
    const high = state.unit === "C" ? Math.round(daily.temperature_2m_max[i]) : Math.round(cToF(daily.temperature_2m_max[i]));
    const low = state.unit === "C" ? Math.round(daily.temperature_2m_min[i]) : Math.round(cToF(daily.temperature_2m_min[i]));
    const precip = Math.round(daily.precipitation_probability_max[i] ?? 0);

    const div = document.createElement("div");
    div.className = "day-card" + (isToday ? " today" : "");
    div.innerHTML = `
      <div class="day-label">${formatDayLabel(dateStr, isToday)}</div>
      <div class="day-icon">${visual.icon}</div>
      <div class="day-temp">${high}° <span class="low">${low}°</span></div>
      <div class="day-precip">💧 ${precip}%</div>
    `;
    forecastEl.appendChild(div);
  });
}

/* ---------- Render conditions row ---------- */
function renderConditions(data) {
  conditionsEl.innerHTML = "";

  const sunrise = new Date(data.daily.sunrise[0]);
  const sunset = new Date(data.daily.sunset[0]);
  const pressure = Math.round(data.current.surface_pressure);
  const uv = Math.round(data.daily.uv_index_max[0]);

  // find visibility reading closest to the current hour
  let visibilityKm = "--";
  if (data.hourly && data.hourly.time) {
    const nowISO = data.current.time;
    let idx = data.hourly.time.indexOf(nowISO);
    if (idx === -1) idx = 0;
    const meters = data.hourly.visibility[idx];
    if (meters != null) visibilityKm = Math.round(meters / 1000);
  }

  function uvLabel(v) {
    if (v <= 2) return `${v} (Low)`;
    if (v <= 5) return `${v} (Mod)`;
    if (v <= 7) return `${v} (High)`;
    return `${v} (V.High)`;
  }

  const items = [
    { label: "SUNRISE", icon: "🌅", value: formatClockTime(sunrise) },
    { label: "SUNSET", icon: "🌇", value: formatClockTime(sunset) },
    { label: "PRESSURE", icon: "📊", value: `${pressure} hPa` },
    { label: "VISIBILITY", icon: "👁️", value: `${visibilityKm} km` },
    { label: "UV INDEX", icon: "☀️", value: uvLabel(uv) },
    { label: "PRECIPITATION", icon: "🌧️", value: `${Math.round(data.daily.precipitation_probability_max[0] ?? 0)}%` }
  ];

  items.forEach(c => {
    const div = document.createElement("div");
    div.className = "cond-card";
    div.innerHTML = `
      <div class="label">${c.icon} ${c.label}</div>
      <div class="value">${c.value}</div>
    `;
    conditionsEl.appendChild(div);
  });
}

/* ---------- Master render (re-used on unit toggle) ---------- */
function renderAll() {
  if (!state.lastData) return;
  renderCurrent(state.lastCity, state.lastData);
  renderForecast(state.lastData);
  renderConditions(state.lastData);
}

/* ---------- Loading / error UI ---------- */
function setLoading(isLoading) {
  if (isLoading) {
    conditionEl.textContent = "Loading...";
  }
}
function showError(message) {
  conditionEl.textContent = message;
}

/* ---------- Load weather for a city name ---------- */
async function loadCity(cityName) {
  setLoading(true);
  try {
    const place = await geocodeCity(cityName);
    const data = await fetchWeather(place.lat, place.lon);
    state.lastData = data;
    state.lastCity = place.label;
    renderAll();
  } catch (err) {
    showError(err.message === "City not found" ? "City not found" : "Couldn't load weather");
    console.error(err);
  }
}

/* ---------- Load weather for a selected suggestion ---------- */
async function loadSelectedCity() {
  setLoading(true);
  try {
    const data = await fetchWeather(state.selectedLat, state.selectedLon);
    state.lastData = data;
    state.lastCity = state.selectedLabel;
    renderAll();

    // Reset selected state after successful load
    state.selectedLat = null;
    state.selectedLon = null;
    state.selectedLabel = null;
  } catch (err) {
    showError("Couldn't load weather");
    console.error(err);
  }
}

/* ---------- Load weather for the browser's current location ---------- */
function loadCurrentLocation() {
  if (!navigator.geolocation) {
    showError("Location not supported");
    return;
  }
  setLoading(true);
  navigator.geolocation.getCurrentPosition(
    async (pos) => {
      try {
        const { latitude, longitude } = pos.coords;
        const [cityLabel, data] = await Promise.all([
          reverseGeocode(latitude, longitude),
          fetchWeather(latitude, longitude)
        ]);
        state.lastData = data;
        state.lastCity = cityLabel;
        renderAll();
      } catch (err) {
        showError("Couldn't load weather");
        console.error(err);
      }
    },
    () => showError("Location permission denied")
  );
}

/* ---------- Button wiring ---------- */
function initSearch() {
  searchInput.addEventListener("input", (e) => {
    // Clear selected state if user types manually
    state.selectedLat = null;
    state.selectedLon = null;
    state.selectedLabel = null;

    const val = e.target.value.trim();
    if (val.length < 2) {
      autocompleteDropdown.style.display = "none";
      if (autocompleteAbortController) autocompleteAbortController.abort();
      clearTimeout(debounceTimeout);
      return;
    }

    clearTimeout(debounceTimeout);
    debounceTimeout = setTimeout(() => {
      fetchSuggestions(val);
    }, 500);
  });

  searchInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && searchInput.value.trim()) {
      autocompleteDropdown.style.display = "none";
      if (state.selectedLat !== null) {
        loadSelectedCity();
      } else {
        loadCity(searchInput.value.trim());
      }
    }
  });

  // Hide dropdown on click outside
  document.addEventListener("click", (e) => {
    if (!searchInput.contains(e.target) && !autocompleteDropdown.contains(e.target)) {
      autocompleteDropdown.style.display = "none";
    }
  });
}

function initHeaderIcons() {
  // Order in the header markup: [0] location pin, [1] settings, [2] profile
  const [locationBtn, settingsBtn, profileBtn] = headerIcons;

  if (locationBtn) {
    locationBtn.style.cursor = "pointer";
    locationBtn.addEventListener("click", loadCurrentLocation);
  }

  if (settingsBtn) {
    settingsBtn.style.cursor = "pointer";
    settingsBtn.addEventListener("click", () => {
      state.unit = state.unit === "C" ? "F" : "C";
      renderAll();
    });
  }

  if (profileBtn) {
    profileBtn.style.cursor = "pointer";
    profileBtn.addEventListener("click", () => {
      alert(`Currently showing: ${state.lastCity}\nUnits: °${state.unit}`);
    });
  }
}

/* ---------- Init ---------- */
function init() {
  startClock();
  initSearch();
  initHeaderIcons();
  // default city on first load
  loadCity("Chennai");
}

document.addEventListener("DOMContentLoaded", init);