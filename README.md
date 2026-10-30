# TripFare — Train, Bus & Flight Fare Finder

## What works in this project
- Flask web app with origin, destination, travel date, and passenger count.
- Flight fare lookup via Amadeus Flight Offers Search, when valid credentials and route mappings are configured.
- Train and bus provider adapters that can connect to authorised partner APIs.
- Clear statuses: Offers found, Not available, Fare API not connected, Unable to retrieve fares.
- Official IRCTC, redBus, and IndiGo links.
- Responsive UI.

## Important data limitation
This code does not contain access to private IRCTC or redBus fare inventory. You must obtain access to a suitable authorised API/partner integration and configure `TRAIN_API_URL` / `TRAIN_API_KEY` and `BUS_API_URL` / `BUS_API_KEY`. Until then, the app correctly says the fare API is not connected rather than inventing prices.

The provider links open official websites, but are not prefilled with route/date because provider-specific deep links may require internal station/city IDs and can change. The app preserves the search in its own results header.

## Requirements
- Python 3.10+
- Internet access for API calls
- Amadeus developer credentials for flight fare lookup
- Authorised train/bus API access if you want those fares too

## Run locally (Linux/macOS)
```bash
cd tripfare_project
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
```
Edit `.env` and add your Amadeus API key and secret. For initial testing, use:
`AMADEUS_BASE_URL=https://test.api.amadeus.com`

Then run:
```bash
python app.py
```
Open http://127.0.0.1:5000

On Windows, activate with:
```powershell
.venv\Scripts\activate
```

## Flight API notes
- Amadeus test environment contains limited/sample data and is not production fare availability.
- To show live production fares, configure the production base URL only after your Amadeus account has production access.
- The code includes a small city-to-airport mapping. Add locations as needed or replace it with an airport/city lookup API.
- A returned flight offer is not a final ticket. The final fare and availability must be confirmed with the booking provider.

## Connecting a train or bus API
Set the matching endpoint and API key in `.env`. The endpoint should accept a GET request with:
- `origin`
- `destination`
- `date` (YYYY-MM-DD)
- `adults`

It should return:
```json
{
  "offers": [
    {
      "provider": "Example provider",
      "name": "Service name or number",
      "departure": "2026-11-14T08:00:00",
      "arrival": "2026-11-14T15:00:00",
      "price": 1200,
      "currency": "INR",
      "booking_url": "https://provider.example/booking"
    }
  ]
}
```
An empty `offers` array means that connected provider returned no matching offers. A network/API error is reported as an error, not as “Not available”.

## Security / deployment
- Never commit `.env` or expose API secrets in browser JavaScript.
- Add `.env` to `.gitignore` before pushing to GitHub.
- Do not use Flask's development server for production deployment.
- Check provider API terms, quotas, caching rules, and applicable legal requirements before launch.
