const form = document.getElementById("search-form");
const results = document.getElementById("results");
const message = document.getElementById("message");
const summary = document.getElementById("search-summary");
const submitButton = document.getElementById("submit-btn");
const dateInput = document.getElementById("travelDate");
const originInput = document.getElementById("origin");
const destinationInput = document.getElementById("destination");

function localDateString(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
dateInput.min = localDateString(new Date());

document.getElementById("swap-btn").addEventListener("click", () => {
  const oldOrigin = originInput.value;
  originInput.value = destinationInput.value;
  destinationInput.value = oldOrigin;
  originInput.focus();
});

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[c]);
}

function setupCityAutocomplete(input, list) {
  let timer;
  let lastQuery = "";
  input.addEventListener("input", () => {
    const query = input.value.trim();
    clearTimeout(timer);
    if (query.length < 2 || query === lastQuery) return;
    timer = setTimeout(async () => {
      lastQuery = query;
      try {
        const response = await fetch(`/api/cities?q=${encodeURIComponent(query)}`);
        const data = await response.json();
        list.innerHTML = (data.cities || []).map(city =>
          `<option value="${escapeHTML(city.label)}"></option>`
        ).join("");
      } catch (_) {
        // The user can still type a city manually if suggestions are unavailable.
      }
    }, 250);
  });
}
setupCityAutocomplete(originInput, document.getElementById("origin-cities"));
setupCityAutocomplete(destinationInput, document.getElementById("destination-cities"));

function statusLabel(status) {
  const labels = {
    available: "Offers found", not_available: "Not available",
    not_configured: "Fare API not connected", lookup_error: "Unable to retrieve fares",
    invalid_route: "Check route"
  };
  return labels[status] || "Status unknown";
}

function flightSearchURL(origin, destination, travelDate, airline) {
  const parts = [`Flights from ${origin} to ${destination}`, `on ${travelDate}`];
  if (airline) parts.push(`airline ${airline}`);
  return `https://www.google.com/travel/flights?q=${encodeURIComponent(parts.join(" "))}`;
}

function bookingCard(title, icon, result, booking, route = {}) {
  result = result || {};
  booking = booking || {};
  const offers = Array.isArray(result.offers) ? result.offers : [];
  let offerHTML = "";

  if (result.status === "available" && offers.length) {
    offerHTML = offers.map(offer => {
      const price = offer.price === null || offer.price === undefined
        ? "Price not provided" : `${escapeHTML(offer.currency || "INR")} ${escapeHTML(offer.price)}`;
      const name = offer.airline
        ? `${offer.airline} ${offer.flight_number || ""}`.trim()
        : (offer.name || offer.provider || title);
      const times = [offer.departure, offer.arrival].filter(Boolean).join(" → ");
      const stops = offer.stops === undefined ? "" : `<div class="muted">${Number(offer.stops) === 0 ? "Non-stop" : `${escapeHTML(offer.stops)} stop(s)`}</div>`;

      // Use an offer-specific URL if the provider supplies one. Otherwise,
      // link to a Google Flights search for the same route/date/airline.
      // This fallback does not guarantee the identical fare will still appear.
      const offerURL = offer.booking_url || (title === "Flights"
        ? flightSearchURL(route.origin, route.destination, route.travelDate, offer.airline)
        : "");
      const linkedName = offerURL
        ? `<a class="offer-title-link" href="${escapeHTML(offerURL)}" target="_blank" rel="noopener noreferrer" title="Search this flight option">${escapeHTML(name)} ↗</a>`
        : `<strong>${escapeHTML(name)}</strong>`;
      const link = offerURL
        ? `<a class="offer-action" href="${escapeHTML(offerURL)}" target="_blank" rel="noopener noreferrer">View flight / fare ↗</a>`
        : "";

      return `<div class="detail">
        ${linkedName}
        ${times ? `<div>${escapeHTML(times)}</div>` : ""}
        <div class="price">${price}</div>
        ${stops}
        ${link}
      </div>`;
    }).join("");
  } else {
    offerHTML = `<p>${escapeHTML(result.message || "No status details were provided.")}</p>`;
  }

  const bookingURL = booking.url || "";
  const provider = booking.provider || title;
  const bookingLink = bookingURL
    ? `<a class="booking-link" href="${escapeHTML(bookingURL)}" target="_blank" rel="noopener noreferrer">Search on ${escapeHTML(provider)} ↗</a>`
    : "";

  const fareLinkNote = title === "Flights" && offers.length
    ? `<p class="muted fare-link-note">Flight links open a matching Google Flights search unless the provider supplies a direct booking link. The exact displayed fare is not guaranteed to carry over.</p>`
    : "";

  return `<article class="card result-card">
    <div class="card-top"><span class="icon">${icon}</span><h2>${escapeHTML(title)}</h2></div>
    <span class="status ${escapeHTML(result.status || "")}">${escapeHTML(statusLabel(result.status))}</span>
    <div class="offers-list">${offerHTML}</div>
    ${fareLinkNote}
    ${bookingLink}
  </article>`;
}

const destinationIdeas = {
  bengaluru: {
    places: [["🌳", "Cubbon Park", "A leafy break in the heart of the city"], ["🏛️", "Vidhana Soudha", "See Bengaluru's iconic architecture"], ["☕", "Church Street", "Cafes, bookstores and a lively stroll"], ["🌄", "Nandi Hills", "A sunrise escape if you have extra time"]],
    summary: "Green spaces, iconic landmarks and buzzing cafe streets await. Allow extra time for city traffic, especially on weekends."
  },
  bangalore: null,
  hyderabad: {
    places: [["🏰", "Charminar", "Explore the city's historic heart"], ["🥘", "Old City food walk", "Discover famous local flavours"], ["🌅", "Hussain Sagar", "Enjoy a lakeside evening"], ["🏛️", "Golconda Fort", "Plan time for the historic fort complex"]],
    summary: "Expect rich history, lively bazaars and a memorable food scene. Carry water when exploring outdoor sights in warm weather."
  },
  goa: {
    places: [["🏖️", "Beach time", "Choose a beach that suits your pace"], ["🏘️", "Fontainhas", "Wander through colourful heritage lanes"], ["⛪", "Old Goa", "Explore historic churches and architecture"], ["🌇", "Sunset viewpoint", "Leave time for a relaxed evening"]],
    summary: "Beach days, heritage streets and slow sunsets are the draw. Check seasonal weather and local transport before heading out."
  },
  mumbai: {
    places: [["🏛️", "Gateway of India", "A classic waterfront landmark"], ["🚆", "Marine Drive", "Take a stroll along the Queen's Necklace"], ["🎨", "Kala Ghoda", "Explore galleries and heritage streets"], ["🍴", "Local food stop", "Try a neighbourhood favourite"]],
    summary: "A high-energy mix of waterfront views, culture and food awaits. Build in buffer time for traffic and crowded local transport."
  },
  chennai: {
    places: [["🏖️", "Marina Beach", "Take an early or evening walk"], ["🏛️", "Kapaleeshwarar Temple", "Admire traditional Dravidian architecture"], ["🎭", "Mylapore", "Explore culture and local shops"], ["🥥", "South Indian tiffin", "Make time for a classic local breakfast"]],
    summary: "Coastal walks, temple architecture and excellent tiffin are highlights. Heat and humidity can be strong, so plan outdoor visits accordingly."
  },
  delhi: {
    places: [["🏰", "Red Fort", "Explore a major historic landmark"], ["🌿", "Lodhi Garden", "Take a peaceful green-space break"], ["🏛️", "Humayun's Tomb", "Discover Mughal-era architecture"], ["🍲", "Food stop", "Try a well-reviewed local favourite"]],
    summary: "Monuments, gardens and a huge food scene make for a varied visit. Check opening days and seasonal air quality before planning outdoor stops."
  },
  kochi: {
    places: [["🎨", "Fort Kochi", "Explore art, heritage and cafes"], ["🎣", "Chinese fishing nets", "See the waterfront landmark"], ["⛴️", "Ferry ride", "Enjoy the harbour from the water"], ["🥥", "Kerala cuisine", "Try a local meal"]],
    summary: "Harbour views, heritage lanes and Kerala flavours set the mood. Leave flexibility for rain and ferry timings."
  },
  pune: {
    places: [["🏰", "Shaniwar Wada", "Visit the historic fortification"], ["🌳", "Pashan Lake", "Take a nature break"], ["☕", "Cafe neighbourhoods", "Explore Pune's relaxed cafe culture"], ["🛕", "Dagadusheth Halwai Ganpati", "See a well-known city landmark"]],
    summary: "History, green corners and a lively cafe scene are easy to mix. Traffic can vary a lot by time of day."
  }
};
destinationIdeas.bangalore = destinationIdeas.bengaluru;

function adventureCard(origin, destination) {
  const key = destination.split(",")[0].trim().toLowerCase();
  const data = destinationIdeas[key];
  const places = (data?.places || [
    ["📍", `${destination.split(",")[0]} city highlights`, "Explore the destination's best-known sights"],
    ["🍽️", "Local food discovery", "Find a well-reviewed regional favourite"],
    ["🌿", "A nature or cultural stop", "Add a park, museum or heritage spot to your plan"]
  ]).slice(0, 3);
  const summaryText = data?.summary || `Look forward to discovering ${destination.split(",")[0]}'s local food, culture and standout sights. Check opening hours and local transport before setting off.`;
  const stops = places.map((p, i) => `<div class="map-stop"><span class="stop-pin">${p[0]}</span><div><strong>${escapeHTML(p[1])}</strong><p>${escapeHTML(p[2])}</p></div></div>`).join("");
  const mapUrl = `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(destination)}&travelmode=transit`;
  return `<article class="adventure-card">
    <div class="adventure-heading"><span>✦ YOUR DESTINATION ADVENTURE</span><h2>A little inspiration for ${escapeHTML(destination.split(",")[0])}</h2><p>Places and experiences to add to your plan</p></div>
    <div class="route-map"><div class="route-end top"><span class="endpoint-icon">🏁</span><div><small>YOUR DESTINATION</small><strong>${escapeHTML(destination)}</strong></div></div>
      <div class="route-stops">${stops}</div>
      <div class="route-end bottom"><span class="endpoint-icon">🚩</span><div><small>STARTING FROM</small><strong>${escapeHTML(origin)}</strong></div></div>
    </div>
    <div class="trip-nugget"><strong>💡 The trip in a nutshell</strong><p>${escapeHTML(summaryText)}</p></div>
    <a class="booking-link map-link" href="${mapUrl}" target="_blank" rel="noopener noreferrer">Explore route on Google Maps ↗</a>
    <p class="muted adventure-note">Suggestions are inspiration, not confirmed stops along the transport route. Check opening hours and local conditions before visiting.</p>
  </article>`;
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const origin = originInput.value.trim();
  const destination = destinationInput.value.trim();
  const travelDate = dateInput.value;
  const adults = Number(document.getElementById("adults").value);
  if (!origin || !destination || !travelDate) return;
  if (origin.toLowerCase() === destination.toLowerCase()) {
    message.hidden = false; message.textContent = "Choose two different locations."; return;
  }
  submitButton.disabled = true; submitButton.textContent = "Planning…";
  message.hidden = false; message.textContent = "Checking connected fare providers and preparing your trip inspiration…";
  results.innerHTML = "";
  try {
    const response = await fetch("/api/fares", {
      method: "POST", headers: {"Content-Type": "application/json"},
      body: JSON.stringify({origin, destination, travelDate, adults})
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Search failed.");
    summary.hidden = false;
    summary.innerHTML = `${escapeHTML(origin)} <span class="route-arrow">→</span> ${escapeHTML(destination)}
      <div class="muted">${escapeHTML(travelDate)} · ${adults} passenger(s)</div>`;
    const f = data.fares, b = data.bookingLinks;
    results.innerHTML = bookingCard("Flights", "✈️", f.flight, b.flight, {
      origin, destination, travelDate
    }) + bookingCard("Trains", "🚆", f.train, b.train) + adventureCard(origin, destination);
    message.hidden = true;
    // Bring the three comparison cards into view automatically after search.
    results.scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (error) {
    message.hidden = false; message.textContent = error.message || "Could not complete the search.";
  } finally {
    submitButton.disabled = false; submitButton.textContent = "Plan my trip ✨";
  }
});
