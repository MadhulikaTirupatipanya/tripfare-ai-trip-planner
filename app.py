import os
from datetime import date
from urllib.parse import quote_plus

import requests
from dotenv import load_dotenv
from flask import Flask, jsonify, render_template, request

load_dotenv()
app = Flask(__name__)

SERPAPI_API_KEY = os.getenv("SERPAPI_API_KEY", "").strip()

RAILRADAR_API_KEY = os.getenv("RAILRADAR_API_KEY", "").strip()
RAILRADAR_BASE_URL = "https://api.railradar.in/v1"

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
    """Find trains with RailRadar and fetch indicative fares for a few trains.

    RailRadar's fare endpoint requires a train number, source/destination
    station codes, journey date, and class code. To conserve the monthly API
    quota, this requests the route once and fares for at most three trains.
    """
    origin_key = origin.split(",")[0].strip().casefold()
    destination_key = destination.split(",")[0].strip().casefold()
    origin_code = RAILWAY_STATION_CODES.get(origin_key)
    destination_code = RAILWAY_STATION_CODES.get(destination_key)

    if not RAILRADAR_API_KEY:
        return {
            "status": "not_configured",
            "message": "Add RAILRADAR_API_KEY to your .env file to enable train search.",
            "offers": [],
        }

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

    headers = {
        "Authorization": f"Bearer {RAILRADAR_API_KEY}",
        "Accept": "application/json",
    }

    try:
        route_response = requests.get(
            f"{RAILRADAR_BASE_URL}/trains/between/{origin_code}/{destination_code}",
            headers=headers,
            params={"date": travel_date, "live": "false"},
            timeout=20,
        )

        if route_response.status_code in (401, 403):
            app.logger.warning("RailRadar train lookup authentication failed: HTTP %s", route_response.status_code)
            return {
                "status": "not_configured",
                "message": "RailRadar rejected the API key or this endpoint is not enabled for your plan. Check your RailRadar dashboard.",
                "offers": [],
            }
        if route_response.status_code == 429:
            return {
                "status": "lookup_error",
                "message": "RailRadar's monthly or per-minute request limit was reached. Try again later.",
                "offers": [],
            }

        route_response.raise_for_status()
        route_payload = route_response.json()
        data = route_payload.get("data", route_payload)

        # The API may return a list directly or nest it under one of these keys.
        trains = data if isinstance(data, list) else (
            data.get("trains") or data.get("results") or data.get("items") or []
        )

        if not isinstance(trains, list) or not trains:
            return {
                "status": "not_available",
                "message": "RailRadar returned no trains for this route. Try another date or a different station.",
                "offers": [],
            }

        offers = []
        # Each fare request consumes quota. Three trains is a deliberate limit.
        for train in trains[:3]:
            if not isinstance(train, dict):
                continue

            number = str(
                train.get("trainNumber") or train.get("train_number") or
                train.get("number") or train.get("trainNo") or ""
            ).strip()
            name = str(
                train.get("trainName") or train.get("train_name") or
                train.get("name") or "Indian Railways train"
            ).strip()
            departure = str(
                train.get("departureTime") or train.get("departure") or
                train.get("scheduledDeparture") or train.get("fromTime") or ""
            )
            arrival = str(
                train.get("arrivalTime") or train.get("arrival") or
                train.get("scheduledArrival") or train.get("toTime") or ""
            )
            duration = str(train.get("duration") or train.get("journeyDuration") or "")

            if not number:
                continue

            price = None
            fare_class = "3A"
            fare_breakdown = {}
            fare_error = None

            try:
                fare_response = requests.get(
                    f"{RAILRADAR_BASE_URL}/trains/{quote_plus(number)}/fare",
                    headers=headers,
                    params={
                        "source": origin_code,
                        "destination": destination_code,
                        "journeyDate": travel_date,
                        "classCode": fare_class,
                        "quotaCode": "GN",
                    },
                    timeout=15,
                )

                if fare_response.ok:
                    fare_payload = fare_response.json()
                    fare_data = fare_payload.get("data", fare_payload)
                    breakdown = fare_data.get("breakdown", {}) if isinstance(fare_data, dict) else {}
                    if isinstance(breakdown, dict):
                        fare_breakdown = breakdown
                        price = breakdown.get("totalFare") or breakdown.get("total_fare") or fare_data.get("totalFare")
                    if price is not None:
                        try:
                            price = float(price)
                        except (TypeError, ValueError):
                            price = None
                else:
                    fare_error = f"Fare endpoint returned HTTP {fare_response.status_code}"
                    app.logger.info("RailRadar fare unavailable for train %s: %s", number, fare_error)
            except (requests.RequestException, ValueError) as exc:
                app.logger.info("RailRadar fare lookup failed for train %s: %s", number, type(exc).__name__)

            offers.append({
                "provider": "RailRadar / Indian Railways",
                "name": f"{name} ({number})",
                "train_number": number,
                "departure": departure,
                "arrival": arrival,
                "duration": duration,
                "train_type": str(train.get("type") or train.get("trainType") or ""),
                "classes": train.get("classes") or train.get("availableClasses") or [],
                "price": price,
                "currency": "INR",
                "fare_class": fare_class if price is not None else None,
                "all_fares": fare_breakdown,
                "booking_url": "https://www.irctc.co.in/",
            })

        if not offers:
            return {
                "status": "not_available",
                "message": "RailRadar returned train records, but no usable train numbers were included.",
                "offers": [],
            }

        priced_count = sum(1 for offer in offers if offer.get("price") is not None)
        if priced_count:
            message = (
                f"RailRadar returned {len(offers)} trains and fares for {priced_count}. "
                "The displayed fare is for 3A (AC 3-tier), General quota; confirm the final fare and availability on IRCTC."
            )
        else:
            message = (
                f"RailRadar returned {len(offers)} trains, but did not return fare amounts for 3A. "
                "Check your plan's fare access and confirm prices on IRCTC."
            )

        return {"status": "available", "message": message, "offers": offers}

    except requests.Timeout:
        app.logger.warning("RailRadar train search timed out.")
        return {"status": "lookup_error", "message": "Train search timed out. Please try again.", "offers": []}
    except requests.HTTPError as exc:
        status_code = exc.response.status_code if exc.response is not None else "unknown"
        app.logger.warning("RailRadar train search failed: HTTP %s", status_code)
        if status_code == 404:
            message = "RailRadar could not find trains for these station codes. Try a different supported city/station."
        elif status_code == 429:
            message = "RailRadar's request quota was reached. Try again later."
        else:
            message = f"RailRadar returned HTTP {status_code}. Check the API key, plan access, and station codes."
        return {"status": "lookup_error", "message": message, "offers": []}
    except (requests.RequestException, ValueError) as exc:
        app.logger.warning("RailRadar train search error: %s", type(exc).__name__)
        return {"status": "lookup_error", "message": "Could not retrieve train information from RailRadar.", "offers": []}


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
