
"use strict";

// ============================================================
// TripFare — Frontend JavaScript
// Dynamic cities, route swapping, round trips, fare cards,
// clickable flight offers, and destination adventure card.
// ============================================================

const form = document.getElementById("search-form");
const results = document.getElementById("results");
const message = document.getElementById("message");
const summary = document.getElementById("search-summary");
const submitButton = document.getElementById("submit-btn");

const originInput = document.getElementById("origin");
const destinationInput = document.getElementById("destination");
const dateInput = document.getElementById("travelDate");
const adultsInput = document.getElementById("adults");

const swapButton = document.getElementById("swap-btn");
const cityList = document.getElementById("city-options");
const returnDateInput = document.getElementById("returnDate");
const returnDateContainer = document.getElementById("return-date-container");

function localDateString(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

const today = localDateString(new Date());

if (dateInput) dateInput.min = today;
if (returnDateInput) returnDateInput.min = today;

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, c => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[c]);
}

function showMessage(text) {
  if (!message) return;
  message.hidden = false;
  message.textContent = text;
}

function hideMessage() {
  if (!message) return;
  message.hidden = true;
  message.textContent = "";
}

function normalizeLocation(value) {
  return String(value ?? "").trim().toLowerCase();
}

function getTripType() {
  const selected = document.querySelector(
    'input[name="tripType"]:checked'
  );
  return selected ? selected.value : "oneway";
}

function isRoundTrip() {
  return getTripType() === "roundtrip";
}

// ============================================================
// Dynamic city suggestions
// Backend endpoint: /api/cities?q=city
// ============================================================

let citySearchTimer;
let cityRequestController;

function getCityName(city) {
  if (typeof city === "string") return city;
  if (!city || typeof city !== "object") return "";

  if (city.label) return city.label;

  const name = city.name || city.city || city.display_name;
  if (!name) return "";

  return [
    name,
    city.admin1 || city.region || city.state,
    city.country || city.country_name
  ].filter(Boolean).join(", ");
}

function updateCityOptions(cities) {
  if (!cityList) return;

  const uniqueCities = [
    ...new Set(cities.map(getCityName).map(name => name.trim()).filter(Boolean))
  ];

  cityList.innerHTML = uniqueCities.map(city =>
    `<option value="${escapeHTML(city)}"></option>`
  ).join("");
}

async function fetchCitySuggestions(query) {
  if (!cityList || query.length < 2) {
    if (cityList) cityList.innerHTML = "";
    return;
  }

  if (cityRequestController) cityRequestController.abort();
  cityRequestController = new AbortController();

  try {
    const response = await fetch(
      `/api/cities?q=${encodeURIComponent(query)}`,
      { signal: cityRequestController.signal }
    );

    if (!response.ok) {
      throw new Error("City lookup failed.");
    }

    const data = await response.json();

    let cities = [];

    if (Array.isArray(data)) {
      cities = data;
    } else if (Array.isArray(data.cities)) {
      cities = data.cities;
    } else if (Array.isArray(data.results)) {
      cities = data.results;
    }

    updateCityOptions(cities);

  } catch (error) {
    if (error.name !== "AbortError") {
      console.warn("City suggestion error:", error.message);
    }
  }
}

function handleCityInput(event) {
  clearTimeout(citySearchTimer);

  citySearchTimer = setTimeout(() => {
    fetchCitySuggestions(event.target.value.trim());
  }, 300);
}

originInput?.addEventListener("input", handleCityInput);
destinationInput?.addEventListener("input", handleCityInput);

// ============================================================
// Swap locations
// ============================================================

swapButton?.addEventListener("click", () => {
  const oldOrigin = originInput.value;
  originInput.value = destinationInput.value;
  destinationInput.value = oldOrigin;

  hideMessage();

  fetchCitySuggestions(originInput.value.trim());
  fetchCitySuggestions(destinationInput.value.trim());
});

// ============================================================
// One-way / round-trip controls
// ============================================================

function updateTripTypeUI() {
  const roundTrip = isRoundTrip();

  if (returnDateContainer) {
    returnDateContainer.hidden = !roundTrip;
  }

  if (returnDateInput) {
    returnDateInput.required = roundTrip;
    returnDateInput.min = dateInput?.value || today;

    if (
      roundTrip &&
      returnDateInput.value &&
      returnDateInput.value < (dateInput?.value || today)
    ) {
      returnDateInput.value = "";
    }
  }
}

document.querySelectorAll('input[name="tripType"]').forEach(input => {
  input.addEventListener("change", updateTripTypeUI);
});

dateInput?.addEventListener("change", () => {
  if (!returnDateInput) return;

  returnDateInput.min = dateInput.value || today;

  if (
    returnDateInput.value &&
    returnDateInput.value < dateInput.value
  ) {
    returnDateInput.value = "";
  }
});

updateTripTypeUI();

// ============================================================
// Flight and train result cards
// ============================================================

function statusLabel(status) {
  const labels = {
    available: "Offers found",
    not_available: "Not available",
    not_configured: "Fare API not connected",
    lookup_error: "Unable to retrieve fares",
    invalid_route: "Check route"
  };

  return labels[status] || "Status unknown";
}

// Generate a Google Flights fallback link.
// This is a search link, not a guaranteed checkout link.
function googleFlightsURL(origin, destination, date, airline, returnDate) {
  const queryParts = [
    `Flights from ${origin} to ${destination}`,
    `on ${date}`
  ];

  if (returnDate) {
    queryParts.push(`returning ${returnDate}`);
  }

  if (airline) {
    queryParts.push(`airline ${airline}`);
  }

  return `https://www.google.com/travel/flights?q=${
    encodeURIComponent(queryParts.join(" "))
  }`;
}

function bookingCard(title, icon, result, booking, route = {}) {
  result = result || {};
  booking = booking || {};

  const offers = Array.isArray(result.offers) ? result.offers : [];

  let offerHTML = "";

  if (result.status === "available" && offers.length) {
    offerHTML = offers.map(offer => {
      const price =
        offer.price === null || offer.price === undefined
          ? "Price not provided"
          : `${escapeHTML(offer.currency || "INR")} ${escapeHTML(offer.price)}`;

      const airline = offer.airline || offer.name || offer.provider || title;
      const flightNumber = offer.flight_number || "";
      const displayName = `${airline} ${flightNumber}`.trim();

      const departureArrival = [
        offer.departure,
        offer.arrival
      ].filter(Boolean).join(" → ");

      const stops = offer.stops === undefined
        ? ""
        : `<div class="muted">${
            Number(offer.stops) === 0
              ? "Non-stop"
              : `${escapeHTML(offer.stops)} stop(s)`
          }</div>`;

      // Prefer an offer-specific URL supplied by the API.
      // Otherwise, open a Google Flights search for this airline.
      const offerURL = offer.booking_url ||
        offer.deep_link ||
        offer.url ||
        googleFlightsURL(
          route.origin || "",
          route.destination || "",
          route.travelDate || "",
          offer.airline || "",
          route.returnDate || ""
        );

      return `
        <div class="detail">
          <a
            class="flight-offer-link"
            href="${escapeHTML(offerURL)}"
            target="_blank"
            rel="noopener noreferrer"
            title="Search or book this flight"
          >
            <strong>${escapeHTML(displayName)}</strong>
          </a>

          ${departureArrival
            ? `<div>${escapeHTML(departureArrival)}</div>`
            : ""}

          <div class="price">${price}</div>
          ${stops}

          <a
            class="booking-link"
            href="${escapeHTML(offerURL)}"
            target="_blank"
            rel="noopener noreferrer"
          >
            View flight / booking options ↗
          </a>
        </div>
      `;
    }).join("");

  } else {
    offerHTML = `<p>${escapeHTML(
      result.message || "No offers are currently available."
    )}</p>`;
  }

  const providerURL = booking.url || "";
  const provider = booking.provider || title;

  const providerLink = providerURL
    ? `
      <a
        class="booking-link"
        href="${escapeHTML(providerURL)}"
        target="_blank"
        rel="noopener noreferrer"
      >
        Search on ${escapeHTML(provider)} ↗
      </a>
    `
    : "";

  return `
    <article class="card">
      <div class="card-top">
        <span class="icon">${icon}</span>
        <h2>${escapeHTML(title)}</h2>
      </div>

      <span class="status ${escapeHTML(result.status || "")}">
        ${escapeHTML(statusLabel(result.status))}
      </span>

      ${offerHTML}

      <p class="muted">
        Prices and availability may change. Verify the fare before booking.
      </p>

      ${providerLink}
    </article>
  `;
}

// ============================================================
// Destination adventure card — replaces the bus card
// ============================================================

function getDestinationIdeas(destination) {
  const city = normalizeLocation(destination);

  const destinations = [
    {
      keywords: ["bengaluru", "bangalore"],
      title: "Explore Bengaluru",
      places: [
        "Lalbagh Botanical Garden",
        "Bengaluru Palace",
        "Cubbon Park"
      ],
      food: "Explore local South Indian food spots."
    },
    {
      keywords: ["hyderabad"],
      title: "Discover Hyderabad",
      places: [
        "Charminar",
        "Golconda Fort",
        "Hussain Sagar"
      ],
      food: "Try local Hyderabadi cuisine."
    },
    {
      keywords: ["goa"],
      title: "Escape to Goa",
      places: [
        "Explore the beaches",
        "Visit Old Goa",
        "Discover local markets"
      ],
      food: "Explore local coastal restaurants."
    },
    {
      keywords: ["mumbai", "bombay"],
      title: "Experience Mumbai",
      places: [
        "Gateway of India",
        "Marine Drive",
        "Chhatrapati Shivaji Maharaj Terminus"
      ],
      food: "Discover Mumbai street food and cafés."
    },
    {
      keywords: ["chennai", "madras"],
      title: "Visit Chennai",
      places: [
        "Marina Beach",
        "Kapaleeshwarar Temple",
        "Government Museum"
      ],
      food: "Explore Chennai's vegetarian restaurants and cafés."
    },
    {
      keywords: ["delhi", "new delhi"],
      title: "Explore Delhi",
      places: [
        "India Gate",
        "Humayun's Tomb",
        "Qutub Minar"
      ],
      food: "Discover Delhi's food markets and restaurants."
    },
    {
      keywords: ["kochi", "cochin"],
      title: "Discover Kochi",
      places: [
        "Fort Kochi",
        "Chinese Fishing Nets",
        "Mattancherry Palace"
      ],
      food: "Explore Kerala cuisine and local cafés."
    },
    {
      keywords: ["pune"],
      title: "Explore Pune",
      places: [
        "Shaniwar Wada",
        "Aga Khan Palace",
        "Sinhagad Fort"
      ],
      food: "Discover Pune's cafés and local food."
    },
    {
      keywords: ["jaipur"],
      title: "Discover Jaipur",
      places: [
        "Hawa Mahal",
        "Amber Fort",
        "City Palace"
      ],
      food: "Explore Rajasthani cuisine."
    },
    {
      keywords: ["mysuru", "mysore"],
      title: "Visit Mysuru",
      places: [
        "Mysore Palace",
        "Chamundi Hills",
        "Brindavan Gardens"
      ],
      food: "Try local Mysuru specialities."
    }
  ];

  return destinations.find(item =>
    item.keywords.some(keyword => city.includes(keyword))
  ) || {
    title: `Explore ${destination}`,
    places: [
      `Discover attractions in ${destination}`,
      "Explore cultural landmarks",
      "Find parks, museums and local experiences"
    ],
    food: "Explore restaurants and cafés near your destination."
  };
}

function adventureCard(origin, destination, travelDate, returnDate) {
  const ideas = getDestinationIdeas(destination);

  const mapURL =
    "https://www.google.com/maps/dir/" +
    encodeURIComponent(origin) +
    "/" +
    encodeURIComponent(destination);

  const placesHTML = ideas.places.map((place, index) => `
    <div class="adventure-stop">
      <span class="stop-number">${index + 1}</span>
      <span>${escapeHTML(place)}</span>
    </div>
  `).join("");

  const dates = returnDate
    ? `Round trip: ${escapeHTML(travelDate)} – ${escapeHTML(returnDate)}`
    : `Departure: ${escapeHTML(travelDate)}`;

  return `
    <article class="card adventure-card">
      <div class="card-top">
        <span class="icon">🗺️</span>
        <h2>Your Destination Adventure</h2>
      </div>

      <div class="adventure-route">
        <div class="route-point">
          <span class="route-dot origin-dot"></span>
          <div>
            <small>STARTING FROM</small>
            <strong>${escapeHTML(origin)}</strong>
          </div>
        </div>

        <div class="route-line"></div>

        <div class="route-point">
          <span class="route-dot destination-dot"></span>
          <div>
            <small>YOUR DESTINATION</small>
            <strong>${escapeHTML(destination)}</strong>
          </div>
        </div>
      </div>

      <div class="adventure-date">📅 ${dates}</div>

      <h3>📍 Places to explore</h3>

      <div class="adventure-stops">
        ${placesHTML}
      </div>

      <div class="adventure-food">
        <strong>🍽️ Food discovery</strong>
        <p>${escapeHTML(ideas.food)}</p>
      </div>

      <p class="muted">
        Suggestions are not live-verified. Check opening hours and travel
        conditions before visiting.
      </p>

      <a
        class="booking-link"
        href="${escapeHTML(mapURL)}"
        target="_blank"
        rel="noopener noreferrer"
      >
        View route on Google Maps ↗
      </a>
    </article>
  `;
}

// ============================================================
// Search submission
// ============================================================

form?.addEventListener("submit", async event => {
  event.preventDefault();

  const origin = originInput?.value.trim() || "";
  const destination = destinationInput?.value.trim() || "";
  const travelDate = dateInput?.value || "";
  const adults = Number(adultsInput?.value || 1);

  const tripType = getTripType();
  const returnDate = returnDateInput?.value || "";

  if (!origin || !destination || !travelDate) {
    showMessage("Please enter your starting location, destination and departure date.");
    return;
  }

  if (normalizeLocation(origin) === normalizeLocation(destination)) {
    showMessage("Choose two different locations.");
    return;
  }

  if (travelDate < today) {
    showMessage("The departure date cannot be in the past.");
    return;
  }

  if (!Number.isInteger(adults) || adults < 1 || adults > 9) {
    showMessage("Please choose between 1 and 9 passengers.");
    return;
  }

  if (tripType === "roundtrip") {
    if (!returnDate) {
      showMessage("Please select a return date.");
      return;
    }

    if (returnDate < travelDate) {
      showMessage("The return date must be on or after the departure date.");
      return;
    }
  }

  if (submitButton) {
    submitButton.disabled = true;
    submitButton.textContent = "Searching…";
  }

  showMessage("Checking connected fare providers…");

  if (results) results.innerHTML = "";

  try {
    const requestBody = {
      origin,
      destination,
      travelDate,
      adults,
      tripType
    };

    if (tripType === "roundtrip") {
      requestBody.returnDate = returnDate;
    }

    const response = await fetch("/api/fares", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(requestBody)
    });

    let data;

    try {
      data = await response.json();
    } catch {
      throw new Error("The server returned an invalid response.");
    }

    if (!response.ok) {
      throw new Error(data.error || "The fare search failed.");
    }

    if (!data.fares) {
      throw new Error("The server response did not contain fare results.");
    }

    if (summary) {
      const dateText = tripType === "roundtrip"
        ? `${travelDate} → ${returnDate}`
        : travelDate;

      summary.hidden = false;
      summary.innerHTML = `
        <strong>
          ${escapeHTML(origin)} → ${escapeHTML(destination)}
        </strong>
        <div class="muted">
          ${escapeHTML(dateText)} · ${adults} passenger(s) ·
          ${tripType === "roundtrip" ? "Round trip" : "One-way"}
        </div>
      `;
    }

    const fares = data.fares;
    const bookingLinks = data.bookingLinks || {};

    const route = {
      origin,
      destination,
      travelDate,
      returnDate: tripType === "roundtrip" ? returnDate : ""
    };

    const flightHTML = bookingCard(
      "Flights",
      "✈️",
      fares.flight,
      bookingLinks.flight,
      route
    );

    const trainHTML = bookingCard(
      "Trains",
      "🚆",
      fares.train,
      bookingLinks.train,
      route
    );

    // No bus fare card.
    const adventureHTML = adventureCard(
      origin,
      destination,
      travelDate,
      tripType === "roundtrip" ? returnDate : ""
    );

    if (results) {
      results.innerHTML = flightHTML + trainHTML + adventureHTML;

      // Scroll the results heading into view after searching.
      results.scrollIntoView({
        behavior: "smooth",
        block: "start"
      });
    }

    hideMessage();

  } catch (error) {
    console.error("TripFare search error:", error);
    showMessage(error.message || "Could not complete the search.");

  } finally {
    if (submitButton) {
      submitButton.disabled = false;
      submitButton.textContent = "Compare fares";
    }
  }
});

