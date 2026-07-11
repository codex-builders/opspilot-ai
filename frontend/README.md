# Operations Command Centre

React dashboard for the OpsPilot backend.

## Run locally

Start the backend from the repository root:

```bash
python3 -m uvicorn backend.app:app --reload
```

Start the frontend in another terminal:

```bash
cd frontend
npm install
npm run dev
```

Vite proxies `/api` to `http://127.0.0.1:8000`. Set `VITE_API_BASE_URL` to override the API base URL in another environment. Backend failures are shown in the dashboard and never fall back to mock results.
