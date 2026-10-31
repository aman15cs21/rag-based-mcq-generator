# RAG Quiz Generator

RAG Quiz Generator turns a text-based PDF into a five-question multiple-choice
quiz. The application extracts the PDF text, splits it into chunks, stores the
chunks in Qdrant with Hugging Face embeddings, retrieves relevant context,
and asks a configured LLM to generate and validate the quiz.

For the complete component, data-flow, API-boundary, deployment, and
reliability design, see [ARCHITECTURE.md](./ARCHITECTURE.md).

## Features

- Upload PDF files up to 10 MB.
- Extract and index PDF text with PyMuPDF and Qdrant.
- Generate exactly five MCQs with four options each.
- Ground questions and explanations in the uploaded document.
- Select answers in a React web interface and receive a score with explanations.
- Use Google Gemini or Groq as the quiz-generation provider.
- Keep document and quiz state in memory at the Express gateway and vectors on
  the configured Qdrant server.

## Architecture

```text
React/Vite frontend (:5173)
              |
              v
Express API gateway (:5000)
              |
              v
Flask RAG/AI service (:8000)
       |                 |
       v                 v
   Qdrant         Gemini or Groq
```

The browser calls the Express gateway. The gateway accepts the PDF upload,
forwards it to Flask as base64, and keeps the generated quiz state needed for
answer submission. Flask owns PDF parsing, embeddings, retrieval, and LLM
generation.

## Project layout

```text
.
├── app.py                         # Flask RAG and LLM service
├── ai.requirement.txt             # Python dependencies
└── rag based mcq generator/
    ├── .env                       # Local secrets and service settings
    ├── requirements.txt           # Same Python dependency list
    ├── frontend/
    │   ├── package.json
    │   └── src/app.jsx            # React application
    └── server/
        ├── package.json
        └── server.js              # Express gateway
```

## Prerequisites

- Python 3.10 or newer
- Node.js 18 or newer and npm
- An API key for at least one supported LLM provider:
  - Google Gemini (`GOOGLE_API_KEY`), or
  - Groq (`GROQ_API_KEY` with `LLM_PROVIDER=groq`)

The first Flask startup may download the
`sentence-transformers/all-MiniLM-L6-v2` embedding model.

## Installation

From the project root:

### 1. Create a Python environment

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
python -m pip install -r "ai.requirement.txt"
```

If PowerShell prevents script activation, run the commands with the Python
executable directly, for example:

```powershell
.\.venv\Scripts\python.exe -m pip install -r "ai.requirement.txt"
```

### 2. Install the Express gateway dependencies

```powershell
Set-Location ".\rag based mcq generator\server"
npm install
```

### 3. Install the frontend dependencies

```powershell
Set-Location "..\frontend"
npm install
```

## Configuration

Create `rag based mcq generator/.env`. Do not commit this file.

### Minimal Gemini configuration

```dotenv
GOOGLE_API_KEY=your-google-api-key
GEMINI_MODEL=gemini-2.5-flash-lite
```

### Groq configuration

```dotenv
LLM_PROVIDER=groq
GROQ_API_KEY=your-groq-api-key
GROQ_MODEL=openai/gpt-oss-120b
```

When both providers are configured, the Flask service includes Groq when
`LLM_PROVIDER=groq` and always includes Gemini when `GOOGLE_API_KEY` is set.
Providers are attempted in the order shown in the Flask startup log. If no
provider is configured, Flask exits with a configuration error.

Optional settings:

| Variable | Default | Description |
| --- | --- | --- |
| `FLASK_PORT` | `8000` | Port used by the Flask service |
| `QDRANT_URL` | `http://localhost:6333` | Qdrant server URL |
| `QDRANT_API_KEY` | unset | Qdrant API key; required for Qdrant Cloud |
| `GEMINI_MODEL` | `gemini-2.5-flash-lite` | Gemini model name |
| `GROQ_MODEL` | `openai/gpt-oss-120b` | Groq model name |
| `AI_SERVICE_URL` | `http://127.0.0.1:8000` | Flask URL used by Express |
| `PORT` | `5000` | Express gateway port |
| `FRONTEND_ORIGIN` | `http://localhost:5173` | Allowed browser origin |

The frontend optionally reads `VITE_API_URL` at build/dev time. If it is not
set, it uses `http://localhost:5000`.

## Running locally

Start each service in a separate terminal, from the project root.

### Terminal 1: Flask RAG service

```powershell
.\.venv\Scripts\python.exe app.py
```

Expected address: `http://127.0.0.1:8000`.

### Terminal 2: Express gateway

```powershell
Set-Location ".\rag based mcq generator\server"
npm start
```

Expected address: `http://localhost:5000`.

### Terminal 3: React frontend

```powershell
Set-Location "..\frontend"
npm run dev
```

Open the URL printed by Vite, normally
`http://localhost:5173`.

## Application workflow

1. Select a text-based PDF in the browser.
2. Click **Upload & Process**.
3. Express sends the PDF to Flask's `/process` endpoint.
4. Flask extracts text, creates overlapping chunks, and persists embeddings in
   Qdrant.
5. Click **Generate 5 Questions**.
6. Flask retrieves relevant chunks and asks the configured LLM for five
   validated questions.
7. Answer every question and click **Submit quiz**.
8. Express evaluates the answers and returns the score, correct answers, and
   explanations.

Scanned/image-only PDFs are not OCR'd. They must contain at least 80 characters
of extractable text.

## API reference

The browser-facing API is exposed by Express at `http://localhost:5000`.

### `GET /api/health`

Returns:

```json
{ "status": "ok" }
```

### `POST /api/upload`

Multipart form upload with field name `file`. Only PDF files are accepted and
the maximum size is 10 MB.

Successful response:

```json
{
  "document_id": "uuid",
  "status": "ready",
  "chunks": 12
}
```

### `GET /api/status/:documentId`

Returns the in-memory processing status for a document. The document ID is
created by Express during upload.

### `POST /api/quiz/generate`

Request:

```json
{ "document_id": "uuid" }
```

Successful responses contain five safe questions. Correct answers and
explanations are intentionally withheld until submission:

```json
{
  "questions": [
    {
      "id": "q1",
      "question": "Question text",
      "options": {
        "A": "Option A",
        "B": "Option B",
        "C": "Option C",
        "D": "Option D"
      }
    }
  ]
}
```

### `POST /api/quiz/submit`

Request:

```json
{
  "document_id": "uuid",
  "answers": {
    "q1": "A",
    "q2": "C"
  }
}
```

The response includes `score`, `total`, `percentage`, and per-question
evaluation details.

The Flask service has corresponding internal endpoints at `/health`,
`/process`, and `/generate-quiz`. These are intended to be called by Express.

## Building the frontend

```powershell
Set-Location ".\rag based mcq generator\frontend"
npm run build
npm run preview
```

Set `VITE_API_URL` before building if the gateway is hosted somewhere other
than `http://localhost:5000`:

```powershell
$env:VITE_API_URL = "https://api.example.com"
npm run build
```

## Troubleshooting

### Flask exits saying no LLM provider is configured

Verify that `rag based mcq generator/.env` exists and contains a valid
`GOOGLE_API_KEY`, or set `LLM_PROVIDER=groq` and provide `GROQ_API_KEY`.

### The frontend cannot upload a PDF

Confirm all three services are running. Check:

```powershell
Invoke-WebRequest http://127.0.0.1:8000/health
Invoke-WebRequest http://localhost:5000/api/health
```

Also check `VITE_API_URL` and `FRONTEND_ORIGIN` if the frontend is not running
on the default Vite origin.

### PDF processing reports no usable text

The current implementation extracts embedded PDF text only. Run OCR on a
scanned PDF before uploading it.

### Quiz generation fails

Check the Flask console for provider errors, confirm the provider API key and
model are available, and ensure the PDF contains enough meaningful text.

### State disappears after a restart

Express stores document status and quiz answer keys in memory. Restarting it
clears those maps. Qdrant vectors remain on the configured server, but the
browser must upload and process the PDF again to create a new gateway document
ID.

## Development notes

- Vector data is stored in the configured Qdrant server.
- The backend rejects files larger than 10 MB.
- The generated quiz must contain exactly five distinct questions.
- The LLM is instructed to use only retrieved PDF context; nevertheless,
  generated content should be reviewed before educational or assessment use.
- There are currently no automated tests configured for the Express package.
