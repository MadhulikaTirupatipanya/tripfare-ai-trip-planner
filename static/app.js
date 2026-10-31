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
  const parts = [`One-way flights from ${origin} to ${destination}`, `on ${travelDate}`];
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
    places: [["🌳", "Cubbon Park", "Green space for a morning walk"], ["🏛️", "Bengaluru Palace", "Historic palace and grounds"], ["🛕", "ISKCON Bengaluru", "Temple complex with city views"], ["🌄", "Nandi Hills", "A day trip for sunrise and hill views"]],
    hotels: [["💎", "Taj MG Road, Bengaluru", "Premium stay near central Bengaluru"], ["🏨", "The Chancery Pavilion", "Central business and shopping access"], ["🛏️", "ibis Bengaluru City Centre", "Practical city-centre option"]],
    restaurants: [["🥘", "MTR (Mavalli Tiffin Rooms)", "Classic South Indian vegetarian meals"], ["🍽️", "Vidyarthi Bhavan", "Famous Bengaluru dosa stop"], ["🥗", "Sattvam", "Vegetarian buffet dining"]],
    summary: "Green parks, heritage sights and a celebrated vegetarian food scene. Plan around Bengaluru traffic."
  },
  bangalore: null,
  hyderabad: {
    places: [["🏰", "Charminar", "Explore the historic Old City"], ["🏛️", "Golconda Fort", "Fort complex with panoramic views"], ["🌅", "Hussain Sagar", "Lakeside stroll and evening views"], ["🕌", "Qutb Shahi Tombs", "Historic tombs and gardens"]],
    hotels: [["💎", "Taj Deccan", "Upscale stay in Banjara Hills"], ["🏨", "Hyderabad Marriott Hotel & Convention Centre", "Hotel near Hussain Sagar"], ["🛏️", "Lemon Tree Premier, HITEC City", "Convenient for the technology district"]],
    restaurants: [["🥘", "Chutneys", "Popular South Indian vegetarian dishes"], ["🍽️", "Santosh Dhaba", "Well-known vegetarian North Indian food"], ["🥗", "Ishtaa", "Vegetarian dining with South Indian options"]],
    summary: "Pair historic monuments with lakeside time and Hyderabad's famous food. Check opening hours and travel time between areas."
  },
  goa: {
    places: [["🏖️", "Miramar or Benaulim Beach", "Choose a beach based on where you stay"], ["🏘️", "Fontainhas", "Colourful heritage lanes in Panaji"], ["⛪", "Old Goa churches", "Historic architecture and museums"], ["🌇", "Fort Aguada", "Coastal views and a historic fort"]],
    hotels: [["💎", "Taj Cidade de Goa Heritage", "Resort-style stay near Panaji"], ["🏨", "Vivanta Goa, Panaji", "Central option for exploring Panaji"], ["🛏️", "Fairfield by Marriott Goa Anjuna", "Stay option near North Goa beaches"]],
    restaurants: [["🥗", "Kokni Kanteen", "Goan flavours; ask for vegetarian dishes"], ["🍽️", "Navtara Veg Restaurant", "Vegetarian Indian meals"], ["🥘", "Cream Choc", "Casual cafe and vegetarian-friendly options"]],
    summary: "Mix beach time with heritage walks. Goa is spread out, so choose accommodation close to the beaches and sights you want to visit."
  },
  mumbai: {
    places: [["🏛️", "Gateway of India", "Waterfront landmark and harbour views"], ["🌊", "Marine Drive", "Classic seafront promenade"], ["🎨", "Kala Ghoda", "Galleries, architecture and heritage streets"], ["🌿", "Sanjay Gandhi National Park", "Nature escape within the city"]],
    hotels: [["💎", "Taj Mahal Palace, Mumbai", "Iconic luxury stay by the waterfront"], ["🏨", "Trident, Nariman Point", "Central business district and sea views"], ["🛏️", "ibis Mumbai Airport", "Practical option near the airport"]],
    restaurants: [["🥗", "Soam", "Gujarati and regional vegetarian food"], ["🍽️", "Shree Thaker Bhojanalay", "Traditional Gujarati thali"], ["🥘", "Prakash Upahaar Kendra", "Popular Maharashtrian vegetarian snacks"]],
    summary: "Explore the waterfront, heritage neighbourhoods and vegetarian Gujarati and Maharashtrian food. Allow plenty of time for traffic."
  },
  chennai: {
    places: [["🏖️", "Marina Beach", "Best for an early or evening walk"], ["🛕", "Kapaleeshwarar Temple", "Traditional Dravidian architecture"], ["🎭", "Mylapore", "Culture, markets and temple streets"], ["🏛️", "Government Museum", "Art, archaeology and history"]],
    hotels: [["💎", "Taj Coromandel, Chennai", "Premium stay in the city"], ["🏨", "The Residency Towers", "Central location with dining nearby"], ["🛏️", "ibis Chennai City Centre", "Practical option for city sightseeing"]],
    restaurants: [["🥘", "Ratna Cafe", "Known for its sambar idli"], ["🍽️", "Murugan Idli Shop", "South Indian tiffin favourites"], ["🥗", "Sangeetha Veg Restaurant", "Vegetarian South Indian meals"]],
    summary: "Plan temple visits and outdoor sightseeing for cooler hours, then try classic South Indian tiffin."
  },
  delhi: {
    places: [["🏰", "Red Fort", "Major Mughal-era landmark"], ["🌿", "Lodhi Garden", "Peaceful green space and tombs"], ["🏛️", "Humayun's Tomb", "UNESCO-listed Mughal architecture"], ["🪷", "Lotus Temple", "Distinctive architecture and quiet grounds"]],
    hotels: [["💎", "The Imperial, New Delhi", "Heritage luxury near central Delhi"], ["🏨", "The Park, New Delhi", "Central location near Connaught Place"], ["🛏️", "ibis New Delhi Aerocity", "Convenient for airport access"]],
    restaurants: [["🥗", "Saravana Bhavan", "South Indian vegetarian dishes"], ["🍽️", "Sattvik", "Vegetarian North Indian dining"], ["🥘", "Haldiram's", "Casual vegetarian Indian food"]],
    summary: "Delhi's monuments and gardens are spread across the city. Check opening days, air quality and travel times before heading out."
  },
  kochi: {
    places: [["🎨", "Fort Kochi", "Heritage streets, art and cafes"], ["🎣", "Chinese Fishing Nets", "Waterfront landmark"], ["⛪", "Santa Cruz Basilica", "Historic church architecture"], ["⛴️", "Marine Drive", "Harbour views and promenades"]],
    hotels: [["💎", "Taj Malabar Resort & Spa", "Waterfront resort on Willingdon Island"], ["🏨", "Fragrant Nature Kochi", "Boutique stay near Fort Kochi"], ["🛏️", "ibis Kochi City Centre", "Central Ernakulam location"]],
    restaurants: [["🥗", "Brindhavan Vegetarian Restaurant", "Vegetarian South Indian meals"], ["🍽️", "Gokul Oottupura", "Vegetarian Kerala and Indian dishes"], ["🥘", "Sree Krishna Inn", "Popular vegetarian dining"]],
    summary: "Combine Fort Kochi's heritage area with a waterfront walk. Leave flexibility for ferry schedules and rain."
  },
  pune: {
    places: [["🏰", "Shaniwar Wada", "Historic fortification in the old city"], ["🌳", "Pashan Lake", "Nature and birdwatching"], ["🛕", "Dagdusheth Halwai Ganpati Temple", "Well-known city temple"], ["🏛️", "Aga Khan Palace", "Historic palace and museum"]],
    hotels: [["💎", "JW Marriott Hotel Pune", "Premium stay in the city"], ["🏨", "The Westin Pune Koregaon Park", "Upscale option near restaurants"], ["🛏️", "ibis Pune Hinjewadi", "Convenient for the Hinjewadi area"]],
    restaurants: [["🥗", "Shabree", "Maharashtrian vegetarian thali"], ["🍽️", "Vaishali", "Popular South Indian vegetarian cafe"], ["🥘", "Wadeshwar", "Vegetarian South Indian snacks and meals"]],
    summary: "Balance heritage sights with Pune's well-known vegetarian eateries. Traffic varies considerably between neighbourhoods."
  }
};
destinationIdeas.bangalore = destinationIdeas.bengaluru;

function mapsSearchURL(query) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

function recommendationList(items, destination, type) {
  const safeItems = Array.isArray(items) ? items : [];
  if (!safeItems.length) return `<p class="muted">Try the map search for current options in ${escapeHTML(destination)}.</p>`;
  return `<div class="recommendation-list">${safeItems.map(item => {
    const title = item[1];
    const description = item[2];
    const query = `${title}, ${destination}`;
    return `<div class="recommendation-item"><span class="recommendation-icon">${item[0]}</span><div class="recommendation-copy"><strong>${escapeHTML(title)}</strong><p>${escapeHTML(description)}</p><a href="${mapsSearchURL(query)}" target="_blank" rel="noopener noreferrer">View on Google Maps ↗</a></div></div>`;
  }).join("")}</div>`;
}

function adventureCard(origin, destination) {
  const destinationName = destination.split(",")[0].trim();
  const key = destinationName.toLowerCase();
  const data = destinationIdeas[key];
  const defaultPlaces = [
    ["📍", `${destinationName} city highlights`, "Explore popular landmarks and neighbourhoods"],
    ["🌿", "Local park or museum", "A relaxed cultural or outdoor stop"],
    ["🏙️", "Historic district", "Explore the destination's local character"]
  ];
  const defaultHotels = [
    ["🏨", "Hotels in the city centre", "Compare location, recent reviews and cancellation terms"],
    ["🛏️", "Business hotels", "Useful for transport links and practical amenities"],
    ["💎", "Highly rated stays", "Check recent guest feedback before booking"]
  ];
  const defaultRestaurants = [
    ["🥗", "Vegetarian restaurants", "Search for vegetarian-friendly meals"],
    ["🍽️", "Local favourites", "Check recent reviews and opening hours"],
    ["☕", "Cafes nearby", "Good for a break between sightseeing stops"]
  ];
  const summaryText = data?.summary || `Explore ${destinationName}'s main sights and local food. Search current hotel and restaurant options on the map, and check recent reviews before booking.`;
  const mapUrl = `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(destination)}&travelmode=transit`;
  return `<article class="adventure-card">
    <div class="adventure-heading"><span>✦ YOUR DESTINATION ADVENTURE</span><h2>Make the most of ${escapeHTML(destinationName)}</h2><p>Places to visit, stays to consider and food to try</p></div>
    <div class="trip-nugget"><strong>💡 At a glance</strong><p>${escapeHTML(summaryText)}</p></div>
    <section class="adventure-section"><h3>📍 Places to visit</h3>${recommendationList(data?.places || defaultPlaces, destinationName, "places")}</section>
    <section class="adventure-section"><h3>🛎️ Hotels to consider</h3>${recommendationList(data?.hotels || defaultHotels, destinationName, "hotels")}</section>
    <section class="adventure-section"><h3>🍴 Restaurants to try</h3>${recommendationList(data?.restaurants || defaultRestaurants, destinationName, "restaurants")}</section>
    <a class="booking-link map-link" href="${mapUrl}" target="_blank" rel="noopener noreferrer">View route on Google Maps ↗</a>
    <p class="muted adventure-note">These are curated suggestions, not live-verified rankings or availability. Check recent reviews, exact location, opening hours, prices and cancellation policies before booking. Restaurant menus can change; confirm vegetarian and egg-free options directly.</p>
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
