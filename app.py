import os
from datetime import date
from urllib.parse import quote_plus

import requests
from dotenv import load_dotenv
from flask import Flask, jsonify, render_template, request

load_dotenv()
app = Flask(__name__)

SERPAPI_API_KEY = os.getenv("SERPAPI_API_KEY", "").strip()

APIMITRA_API_KEY = os.getenv("APIMITRA_API_KEY", "").strip()
APIMITRA_BASE_URL = "https://api.apimitra.in"

# Optional partner integrations for authorised train/bus providers.
TRAIN_API_URL = os.getenv("TRAIN_API_URL", "").strip()
TRAIN_API_KEY = os.getenv("TRAIN_API_KEY", "").strip()

# Basic airport mapping. Values are IATA airport codes.
CITY_CODES = {
    "bengaluru": "BLR", "bangalore": "BLR",
    "hyderabad": "HYD", "goa": "GOI", "mumbai": "BOM",
    "delhi": "DEL", "new delhi": "DEL", "chennai": "MAA",
    "kolkata": "CCU", "pune": "PNQ", "kochi": "COK",
    "cochin": "COK", "ahmedabad": "AMD", "jaipur": "JAI",
    "lucknow": "LKO", "visakhapatnam": "VTZ", "vizag": "VTZ",
    "mangaluru": "IXE", "mangalore": "IXE",
    "coimbatore": "CJB", "madurai": "IXM",
    "varanasi": "VNS", "bhubaneswar": "BBI", "indore": "IDR",
    "nagpur": "NAG", "patna": "PAT", "srinagar": "SXR",
    "amritsar": "ATQ", "thiruvananthapuram": "TRV",
    "trivandrum": "TRV",
    # International airports supported by Flight MCP's public cached endpoint.
    "new york": "JFK", "jfk": "JFK",
    "london": "LHR", "lhr": "LHR",
    "los angeles": "LAX", "lax": "LAX",
    "san francisco": "SFO", "sfo": "SFO",
    "tokyo": "HND", "haneda": "HND", "hnd": "HND",
    "sydney": "SYD", "syd": "SYD",
    "seoul": "ICN", "icn": "ICN",
    "narita": "NRT", "nrt": "NRT",
    "hong kong": "HKG", "hkg": "HKG",
    "singapore": "SIN", "sin": "SIN",
    "paris": "CDG", "cdg": "CDG",
    "frankfurt": "FRA", "fra": "FRA"
}


RAILWAY_STATION_CODES = {
    "bengaluru": "SBC",
    "bangalore": "SBC",
    "hyderabad": "SC",
    "secunderabad": "SC",
    "mumbai": "MMCT",
    "delhi": "NDLS",
    "new delhi": "NDLS",
    "chennai": "MAS",
    "kolkata": "HWH",
    "pune": "PUNE",
    "kochi": "ERS",
    "cochin": "ERS",
    "ahmedabad": "ADI",
    "jaipur": "JP",
    "lucknow": "LKO",
    "visakhapatnam": "VSKP",
    "vizag": "VSKP",
    "mangaluru": "MAQ",
    "mangalore": "MAQ",
    "coimbatore": "CBE",
    "madurai": "MDU",
    "varanasi": "BSB",
    "bhubaneswar": "BBS",
    "indore": "INDB",
    "nagpur": "NGP",
    "patna": "PNBE",
    "amritsar": "ASR",
    "thiruvananthapuram": "TVC",
    "trivandrum": "TVC",
    "goa": "MAO",
}


def resolve_airport_code(city_name):
    """Resolve a city to an IATA airport code using a broad airport directory when available."""
    normalized = city_name.split(",")[0].strip().casefold()
    known = CITY_CODES.get(normalized)
    if known:
        return known
    try:
        import airportsdata
        airports = airportsdata.load("IATA")
        matches = [a for a in airports.values()
                   if str(a.get("city", "")).strip().casefold() == normalized]
        if matches:
            matches.sort(key=lambda a: (not bool(a.get("city")), a.get("iata", "")))
            return matches[0].get("iata")
    except (ImportError, KeyError, TypeError, ValueError):
        pass
    return None


def search_flights(origin, destination, travel_date, adults, trip_type="oneway", return_date=None):
    origin_code = resolve_airport_code(origin)
    destination_code = resolve_airport_code(destination)

    if not SERPAPI_API_KEY:
        return {
            "status": "not_configured",
            "message": "SerpApi key is not configured. Check your .env file.",
            "offers": [],
        }

    if not origin_code or not destination_code:
        return {
            "status": "invalid_route",
            "message": (
                "We do not recognise one or both cities. "
                "Try a supported city name."
            ),
            "offers": [],
        }

    if origin_code == destination_code:
        return {
            "status": "invalid_route",
            "message": "Origin and destination must be different airports.",
            "offers": [],
        }

    params = {
        "engine": "google_flights",
        "departure_id": origin_code,
        "arrival_id": destination_code,
        "outbound_date": travel_date,
        "type": "1" if trip_type == "roundtrip" else "2",
        "adults": adults,
        "currency": "INR",
        "hl": "en",
        "gl": "in",
        "api_key": SERPAPI_API_KEY,
    }

    if trip_type == "roundtrip" and return_date:
        params["return_date"] = return_date

    try:
        response = requests.get(
            "https://serpapi.com/search.json",
            params=params,
            timeout=40,
        )

        response.raise_for_status()
        result = response.json()

        # Google Flights may return results in either collection.
        flights_found = (
            result.get("best_flights")
            or result.get("other_flights")
            or []
        )

        offers = []

        for item in flights_found[:10]:
            segments = item.get("flights") or []

            if not segments:
                continue

            first = segments[0]
            last = segments[-1]

            departure_info = first.get("departure_airport") or {}
            arrival_info = last.get("arrival_airport") or {}

            offers.append({
                "airline": first.get("airline", "Unknown airline"),
                "flight_number": first.get("flight_number", ""),
                "departure": departure_info.get("time", ""),
                "arrival": arrival_info.get("time", ""),
                "stops": max(0, len(segments) - 1),
                "price": item.get("price"),
                "currency": "INR",
            })

        if not offers:
            return {
                "status": "not_available",
                "message": (
                    "SerpApi returned no matching flight options "
                    "for this route and date."
                ),
                "offers": [],
            }

        return {
            "status": "available",
            "message": (
                "Flight options retrieved. Confirm the final fare "
                "and availability before booking."
            ),
            "offers": offers,
        }

    except requests.HTTPError as exc:
        status_code = (
            exc.response.status_code
            if exc.response is not None
            else "unknown"
        )

        app.logger.warning(
            "SerpApi HTTP error: status=%s",
            status_code,
        )

        if status_code == 401:
            message = "SerpApi rejected the API key. Check your credentials."
        elif status_code == 429:
            message = (
                "The SerpApi request limit was reached. "
                "Check your remaining searches."
            )
        else:
            message = (
                f"SerpApi returned HTTP {status_code}. "
                "Please check the API request."
            )

        return {
            "status": "lookup_error",
            "message": message,
            "offers": [],
        }

    except requests.Timeout:
        app.logger.warning("SerpApi request timed out.")

        return {
            "status": "lookup_error",
            "message": "Flight search timed out. Please try again.",
            "offers": [],
        }

    except (requests.RequestException, ValueError) as exc:
        app.logger.warning(
            "SerpApi request failed: %s",
            type(exc).__name__,
        )

        return {
            "status": "lookup_error",
            "message": "Could not retrieve fares from SerpApi.",
            "offers": [],
        }
     
         
def search_partner_api(mode, endpoint, api_key, origin, destination, travel_date, adults):
    """
    Generic adapter for an authorised train/bus provider.
    Expected response JSON:
     {"offers":[{"provider":"Example","name":"Service 123",
                  "departure":"2026-11-14T08:00:00",
                  "arrival":"2026-11-14T15:00:00",
                  "price":1200,"currency":"INR","booking_url":"https://..."}]}
    An empty offers array means the connected provider returned no offers.
    """
    if not endpoint or not api_key:
        return {
            "status": "not_configured",
            "message": f"{mode.title()} live fares need an authorised provider API and credentials.",
            "offers": [],
        }
    try:
        response = requests.get(
            endpoint,
            headers={"Authorization": f"Bearer {api_key}"},
            params={
                "origin": origin,
                "destination": destination,
                "date": travel_date,
                "adults": adults,
            },
            timeout=25,
        )
        response.raise_for_status()
        payload = response.json()
        offers = payload.get("offers", [])
        if not offers:
            return {
                "status": "not_available",
                "message": f"The connected provider returned no matching {mode} offers.",
                "offers": [],
            }
        safe_offers = []
        for item in offers[:10]:
            safe_offers.append({
                "provider": str(item.get("provider", mode.title())),
                "name": str(item.get("name", "Service")),
                "departure": str(item.get("departure", "")),
                "arrival": str(item.get("arrival", "")),
                "price": item.get("price"),
                "currency": str(item.get("currency", "INR")),
                "booking_url": str(item.get("booking_url", "")),
            })
        return {
            "status": "available",
            "message": f"{mode.title()} offers returned by the connected provider.",
            "offers": safe_offers,
        }
    except (requests.RequestException, ValueError) as exc:
        app.logger.warning("%s provider request failed: %s", mode, exc)
        return {
            "status": "lookup_error",
            "message": f"Could not retrieve {mode} fares from the provider.",
            "offers": [],
        }


def search_trains_api(origin, destination, travel_date, adults):
    """Search trains with API Mitra and fetch indicative fares when available."""
    origin_key = origin.split(",")[0].strip().casefold()
    destination_key = destination.split(",")[0].strip().casefold()
    origin_code = RAILWAY_STATION_CODES.get(origin_key)
    destination_code = RAILWAY_STATION_CODES.get(destination_key)

    if not origin_code or not destination_code:
        return {
            "status": "invalid_route",
            "message": (
                "We do not yet recognise one or both railway stations for this city. "
                "Try a supported city or station."
            ),
            "offers": [],
        }

    if origin_code == destination_code:
        return {
            "status": "invalid_route",
            "message": "Origin and destination resolve to the same railway station.",
            "offers": [],
        }

    # API Mitra accepts dates in YYYYMMDD format.
    api_date = travel_date.replace("-", "")
    headers = {"Accept": "application/json"}
    if APIMITRA_API_KEY:
        headers["x-api-key"] = APIMITRA_API_KEY

    try:
        route_response = requests.get(
            f"{APIMITRA_BASE_URL}/train",
            headers=headers,
            params={"from": origin_code, "to": destination_code, "date": api_date},
            timeout=20,
        )

        if route_response.status_code in (401, 403):
            app.logger.warning(
                "API Mitra train lookup authentication failed: HTTP %s",
                route_response.status_code,
            )
            return {
                "status": "not_configured",
                "message": (
                    "API Mitra rejected the credentials or access to train search. "
                    "Check the APIMITRA_API_KEY environment variable and your API access."
                ),
                "offers": [],
            }
        if route_response.status_code == 429:
            return {
                "status": "lookup_error",
                "message": "API Mitra's request limit was reached. Please try again later.",
                "offers": [],
            }

        route_response.raise_for_status()
        route_payload = route_response.json()

        # API Mitra documents a top-level "trains" array.
        trains = route_payload.get("trains", [])
        if not isinstance(trains, list) or not trains:
            return {
                "status": "not_available",
                "message": (
                    "API Mitra returned no trains for this route and date. "
                    "Try another date or a different supported station."
                ),
                "offers": [],
            }

        offers = []
        # Limit fare lookups to three trains to keep API usage modest.
        for train in trains[:5]:
            if not isinstance(train, dict):
                continue

            number = str(
                train.get("train_number") or train.get("trainNumber")
                or train.get("number") or ""
            ).strip()
            if not number:
                continue

            name = str(
                train.get("train_name") or train.get("trainName")
                or train.get("name") or "Indian Railways train"
            ).strip()

            departure = str(train.get("departure") or train.get("departure_time") or "")
            arrival = str(train.get("arrival") or train.get("arrival_time") or "")
            duration = str(train.get("duration") or "")

            # Some responses may provide station objects rather than plain times.
            if isinstance(train.get("from"), dict) and not departure:
                departure = str(train["from"].get("departure") or train["from"].get("time") or "")
            if isinstance(train.get("to"), dict) and not arrival:
                arrival = str(train["to"].get("arrival") or train["to"].get("time") or "")

            classes = train.get("classes") or train.get("available_classes") or []
            price = None
            fare_class = None
            all_fares = {}

            try:
                fare_response = requests.get(
                    f"{APIMITRA_BASE_URL}/train/live",
                    headers=headers,
                    params={"number": number, "date": api_date},
                    timeout=15,
                )
                if fare_response.ok:
                    fare_payload = fare_response.json()
                    fare_data = fare_payload.get("data", fare_payload)
                    fares = fare_data.get("fare", {}) if isinstance(fare_data, dict) else {}
                    if isinstance(fares, dict):
                        all_fares = fares
                        # Prefer common AC classes, then any available positive fare.
                        for preferred_class in ("3A", "CC", "2A", "SL", "3E", "1A"):
                            candidate = fares.get(preferred_class)
                            try:
                                candidate_value = float(candidate)
                            except (TypeError, ValueError):
                                continue
                            if candidate_value > 0:
                                price = candidate_value
                                fare_class = preferred_class
                                break
                        if price is None:
                            for class_name, candidate in fares.items():
                                try:
                                    candidate_value = float(candidate)
                                except (TypeError, ValueError):
                                    continue
                                if candidate_value > 0:
                                    price = candidate_value
                                    fare_class = str(class_name)
                                    break
                else:
                    app.logger.info(
                        "API Mitra fare unavailable for train %s: HTTP %s",
                        number, fare_response.status_code,
                    )
            except (requests.RequestException, ValueError) as exc:
                app.logger.info(
                    "API Mitra fare lookup failed for train %s: %s",
                    number, type(exc).__name__,
                )

            from_info = train.get("from") if isinstance(train.get("from"), dict) else {}
            to_info = train.get("to") if isinstance(train.get("to"), dict) else {}
            if not departure:
                departure = str(from_info.get("departure") or from_info.get("time") or "")
            if not arrival:
                arrival = str(to_info.get("arrival") or to_info.get("time") or "")

            offers.append({
                "provider": "API Mitra / Indian Railways",
                "name": f"{name} ({number})",
                "train_number": number,
                "departure": departure,
                "arrival": arrival,
                "duration": duration,
                "train_type": str(train.get("train_type") or train.get("type") or ""),
                "classes": classes,
                "price": price,
                "currency": "INR",
                "fare_class": fare_class,
                "all_fares": all_fares,
                "booking_url": "https://www.irctc.co.in/",
            })

        if not offers:
            return {
                "status": "not_available",
                "message": "API Mitra returned train records without usable train numbers.",
                "offers": [],
            }

        priced_count = sum(1 for offer in offers if offer.get("price") is not None)
        if priced_count:
            message = (
                f"API Mitra returned {len(offers)} trains and indicative fares for "
                f"{priced_count}. Confirm the final fare and availability on IRCTC."
            )
        else:
            message = (
                f"API Mitra returned {len(offers)} trains, but no fare amounts were available. "
                "Confirm prices and availability on IRCTC."
            )

        return {"status": "available", "message": message, "offers": offers}

    except requests.Timeout:
        app.logger.warning("API Mitra train search timed out.")
        return {
            "status": "lookup_error",
            "message": "Train search timed out. Please try again.",
            "offers": [],
        }
    except requests.HTTPError as exc:
        status_code = exc.response.status_code if exc.response is not None else "unknown"
        app.logger.warning("API Mitra train search failed: HTTP %s", status_code)
        if status_code == 404:
            message = "API Mitra could not find trains for these station codes. Try another supported city/station."
        elif status_code == 429:
            message = "API Mitra's request limit was reached. Try again later."
        else:
            message = f"API Mitra returned HTTP {status_code}. Check API access and station codes."
        return {"status": "lookup_error", "message": message, "offers": []}
    except (requests.RequestException, ValueError) as exc:
        app.logger.warning("API Mitra train search error: %s", type(exc).__name__)
        return {
            "status": "lookup_error",
            "message": "Could not retrieve train information from API Mitra.",
            "offers": [],
        }


def google_maps_route(origin, destination):
    """Build a Google Maps public-transit directions link; no API key needed."""
    maps_url = (
        "https://www.google.com/maps/dir/?api=1"
        f"&origin={quote_plus(origin)}"
        f"&destination={quote_plus(destination)}"
        "&travelmode=transit"
    )
    return {
        "status": "available",
        "message": (
            "Open Google Maps to explore public-transport routes for this journey. "
            "This is a directions link, not a live bus-fare quote."
        ),
        "offers": [],
        "maps_url": maps_url,
    }


def booking_links(origin, destination, travel_date):
    # Official landing/search sites. Provider-side prefilled search URLs are
    # not assumed because deep-link formats can change or require internal IDs.
    # These links always work as destinations; the user may need to re-enter
    # route/date on the provider website.
    return {
        "train": {
            "provider": "IRCTC",
            "url": "https://www.irctc.co.in/",
            "prefilled": False,
        },
        "bus": {
            "provider": "Google Maps",
            "url": (
                "https://www.google.com/maps/dir/?api=1"
                f"&origin={quote_plus(origin)}"
                f"&destination={quote_plus(destination)}"
                "&travelmode=transit"
            ),
            "prefilled": True,
        },
        "flight": {
            "provider": "IndiGo",
            "url": "https://www.goindigo.in/",
            "prefilled": False,
        },
    }

@app.get("/")
def index():
    return render_template("index.html")

@app.get("/api/cities")
def cities():
    """Search worldwide city names using Open-Meteo geocoding; no key required."""
    query = str(request.args.get("q", "")).strip()
    if len(query) < 2:
        return jsonify({"cities": []})
    try:
        response = requests.get(
            "https://geocoding-api.open-meteo.com/v1/search",
            params={"name": query, "count": 10, "language": "en", "format": "json"},
            timeout=8,
        )
        response.raise_for_status()
        payload = response.json()
        seen, suggestions = set(), []
        for item in payload.get("results", []) or []:
            name = str(item.get("name", "")).strip()
            region = str(item.get("admin1", "")).strip()
            country = str(item.get("country", "")).strip()
            if not name:
                continue
            label = ", ".join(part for part in (name, region, country) if part)
            if label.casefold() in seen:
                continue
            seen.add(label.casefold())
            suggestions.append({"label": label, "city": name, "country": country})
        return jsonify({"cities": suggestions})
    except (requests.RequestException, ValueError) as exc:
        app.logger.info("City autocomplete unavailable: %s", type(exc).__name__)
        return jsonify({"cities": [], "message": "City suggestions are temporarily unavailable."})


@app.get("/api/health")
def health():
    return jsonify({"status": "ok"})

@app.post("/api/fares")
def fares():
    data = request.get_json(silent=True) or {}
    origin = str(data.get("origin", "")).strip()
    destination = str(data.get("destination", "")).strip()
    travel_date = str(data.get("travelDate", "")).strip()
    trip_type = str(data.get("tripType", "oneway")).strip().lower()
    return_date = str(data.get("returnDate", "")).strip()

    try:
        adults = int(data.get("adults", 1))
        parsed_date = date.fromisoformat(travel_date)
        parsed_return_date = date.fromisoformat(return_date) if return_date else None
    except (TypeError, ValueError):
        return jsonify({"error": "Enter a valid date and passenger count."}), 400

    if not origin or not destination:
        return jsonify({"error": "Origin and destination are required."}), 400
    if origin.casefold() == destination.casefold():
        return jsonify({"error": "Origin and destination must be different."}), 400
    if adults < 1 or adults > 9:
        return jsonify({"error": "Passenger count must be between 1 and 9."}), 400
    if trip_type not in ("oneway", "roundtrip"):
        return jsonify({"error": "Choose one-way or round trip."}), 400
    if trip_type == "roundtrip" and not parsed_return_date:
        return jsonify({"error": "Choose a return date for a round trip."}), 400
    if parsed_return_date and parsed_return_date < parsed_date:
        return jsonify({"error": "Return date cannot be before the departure date."}), 400
    if parsed_date < date.today():
        return jsonify({"error": "Travel date cannot be in the past."}), 400

    flights = search_flights(origin, destination, travel_date, adults, trip_type, return_date or None)
    trains = search_trains_api(
               origin, destination, travel_date, adults,
    )
    buses = google_maps_route(origin, destination)

    return jsonify({
        "origin": origin,
        "destination": destination,
        "travelDate": travel_date,
        "tripType": trip_type,
        "returnDate": return_date or None,
        "adults": adults,
        "fares": {
            "flight": flights,
            "train": trains,
            "bus": buses,
        },
        "bookingLinks": booking_links(origin, destination, travel_date),
    })

if __name__ == "__main__":
    # For local development only. Use a production WSGI server for deployment.
    app.run(host="127.0.0.1", port=5000, debug=True)
