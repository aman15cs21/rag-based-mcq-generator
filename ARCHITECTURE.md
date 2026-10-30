# RAG Quiz Generator: Complete Architecture

## 1. System overview

RAG Quiz Generator is a local, three-tier application that converts PDF study
material into an automatically generated multiple-choice quiz.

```text
┌──────────────────────────┐
│ React + Vite frontend    │
│ localhost:5173           │
└────────────┬─────────────┘
             │ HTTP/JSON and multipart upload
             ▼
┌──────────────────────────┐
│ Express API gateway      │
│ localhost:5000           │
│ CORS, upload, quiz state │
└────────────┬─────────────┘
             │ Internal HTTP/JSON
             ▼
┌──────────────────────────┐
│ Flask RAG service        │
│ 127.0.0.1:8000           │
│ PDF, embeddings, LLM     │
└───────┬───────────┬──────┘
        │           │
        ▼           ▼
┌──────────────┐  ┌─────────────────┐
│ Qdrant       │  │ LLM provider    │
│ server       │  │ Gemini or Groq  │
└──────────────┘  └─────────────────┘
```

The browser does not call Flask directly. Express is the browser-facing
boundary and proxies processing and quiz-generation requests to Flask.

## 2. Component architecture

### 2.1 React frontend

Location: `rag based mcq generator/frontend/src/app.jsx`

Responsibilities:

- Allow the user to select a PDF.
- Upload the selected PDF to Express.
- Display processing and generation status.
- Request five generated questions.
- Track the user's selected answers.
- Submit answers and render score, correct answers, and explanations.
- Use `VITE_API_URL` when configured; otherwise call
  `http://localhost:5000`.

The frontend is a single-page React application served by Vite during
development and built into static assets for production.

### 2.2 Express API gateway

Location: `rag based mcq generator/server/server.js`

Responsibilities:

- Provide the public `/api/*` API.
- Validate PDF uploads and enforce the 10 MB limit.
- Store uploaded files in memory temporarily.
- Generate a document ID for each upload.
- Forward PDF bytes to Flask as base64 JSON.
- Forward quiz-generation requests to Flask.
- Validate the shape of the generated quiz.
- Hide answer keys and explanations until quiz submission.
- Evaluate submitted answers.
- Apply CORS policy for the configured frontend origin.

The gateway keeps two in-memory maps:

```text
documents: document_id -> processing status and chunk count
quizzes:   document_id -> validated questions and answer keys
```

These maps are lost whenever the Express process restarts.

### 2.3 Flask RAG service

Location: `app.py`

Responsibilities:

- Load environment configuration from
  `rag based mcq generator/.env`.
- Initialize the selected LLM providers.
- Initialize the Hugging Face embedding model.
- Decode and parse PDF data.
- Extract text with PyMuPDF.
- Split text into overlapping chunks.
- Persist chunks and embeddings to Qdrant.
- Retrieve relevant chunks for quiz generation.
- Prompt the LLM to generate exactly five MCQs.
- Parse and validate the model's JSON output.
- Retry configured providers if one fails.

Flask does not store the original PDF. It stores the extracted chunks and their
embeddings in Qdrant.

### 2.4 Qdrant

Location: The configured Qdrant server from `QDRANT_URL`.

Qdrant is the vector store used for retrieval-augmented generation.

For each document, the Flask service creates a collection named from a
sanitized document ID:

```text
ragquiz_<document_id>
```

Each stored chunk includes:

```json
{
  "document_id": "uuid",
  "chunk_index": 0
}
```

The default text-splitting configuration is:

```text
chunk size: 900 characters
overlap:    120 characters
```

The embedding model is:

```text
sentence-transformers/all-MiniLM-L6-v2
```

### 2.5 LLM providers

Supported providers:

- Google Gemini through `langchain-google-genai`
- Groq through `langchain-groq`

The LLM receives retrieved PDF context and a prompt that requires:

- exactly five questions;
- four options named A, B, C, and D;
- exactly one correct answer;
- a short explanation;
- no facts outside the supplied PDF context;
- JSON-only output.

The generated result is validated with Pydantic before it is returned.

## 3. End-to-end request flows

### 3.1 PDF upload and indexing

```text
1. User selects a PDF in React.
2. React sends POST /api/upload to Express as multipart/form-data.
3. Express validates the MIME type/file extension and file size.
4. Express creates a document_id.
5. Express converts the PDF bytes to base64.
6. Express sends POST /process to Flask.
7. Flask decodes the base64 payload.
8. Flask extracts text from every PDF page with PyMuPDF.
9. Flask rejects documents with less than 80 extracted characters.
10. Flask splits the text into overlapping chunks.
11. Flask creates embeddings and writes chunks to Qdrant.
12. Flask returns status and chunk count.
13. Express stores the document as ready.
14. Express returns document_id and chunk count to React.
```

### 3.2 Quiz generation

```text
1. React sends POST /api/quiz/generate with document_id.
2. Express verifies that the document is ready.
3. Express sends POST /generate-quiz to Flask.
4. Flask opens the document's Qdrant collection.
5. Flask performs similarity search for important concepts and facts.
6. Flask combines the retrieved chunks into an LLM context.
7. Flask invokes the configured LLM provider.
8. Flask strips optional Markdown code fences.
9. Flask parses the returned JSON.
10. Pydantic validates the quiz schema.
11. Flask validates option keys, non-empty values, explanations,
    and question uniqueness.
12. Flask returns the five validated questions.
13. Express validates the response again.
14. Express stores the answer key in memory.
15. Express removes correct_answer and explanation from the browser response.
```

### 3.3 Quiz submission and evaluation

```text
1. React verifies that every question has an answer.
2. React sends POST /api/quiz/submit to Express.
3. Express looks up the quiz by document_id.
4. Express validates each selected option as A, B, C, or D.
5. Express compares selected answers with the stored answer key.
6. Express calculates score and percentage.
7. Express returns per-question results and explanations.
8. React renders the result summary and detailed review.
```

## 4. API boundaries

### Browser-facing Express API

| Method | Route | Purpose |
| --- | --- | --- |
| `GET` | `/api/health` | Check that Express is running |
| `POST` | `/api/upload` | Upload and index a PDF through Flask |
| `GET` | `/api/status/:documentId` | Read in-memory document status |
| `POST` | `/api/quiz/generate` | Generate five questions |
| `POST` | `/api/quiz/submit` | Evaluate submitted answers |

### Internal Flask API

| Method | Route | Purpose |
| --- | --- | --- |
| `GET` | `/health` | Check Flask and configured providers |
| `POST` | `/process` | Decode, extract, chunk, embed, and store PDF text |
| `POST` | `/generate-quiz` | Retrieve context and generate a validated quiz |

## 5. Data lifecycle

```text
PDF bytes
   │
   ├── temporary in-memory buffer in Express
   │
   ▼
Extracted text
   │
   ▼
Overlapping text chunks
   │
   ▼
Embeddings + metadata in Qdrant
   │
   ▼
Retrieved context
   │
   ▼
Validated quiz in Express memory
   │
   ▼
Submitted answers and evaluated result
```

Persistence characteristics:

- Qdrant vectors survive process restarts because they are stored on the
  configured Qdrant server.
- Express document status does not survive a restart.
- Express quiz answer keys do not survive a restart.
- Original PDF files are not retained by the application.
- There is no user account, authentication, or multi-user isolation layer.

## 6. Configuration and runtime dependencies

```text
Frontend
  VITE_API_URL

Express
  PORT
  AI_SERVICE_URL
  FRONTEND_ORIGIN

Flask
  FLASK_PORT
  QDRANT_URL
  QDRANT_API_KEY
  LLM_PROVIDER
  GOOGLE_API_KEY
  GEMINI_MODEL
  GROQ_API_KEY
  GROQ_MODEL
```

Default local ports:

```text
React/Vite: 5173
Express:    5000
Flask:      8000
```

## 7. Error handling

### Frontend errors

The React client displays API error messages for failed upload, generation, or
submission requests.

### Express errors

Express returns client errors for invalid input and `502` responses when Flask
or the LLM service cannot process a request. Multer returns `413` when the PDF
exceeds 10 MB.

### Flask errors

Flask returns:

- `400` for missing request fields;
- `422` for insufficient or unusable PDF content;
- `500` for processing or retrieval failures;
- `502` when all configured LLM providers fail.

Detailed server-side exceptions are logged by Flask, while generic messages are
returned to clients.

## 8. Security and reliability boundaries

Current protections:

- PDF-only upload filtering.
- 10 MB upload limit in both services.
- Sanitization of document IDs before using them in Qdrant collection names.
- CORS restricted to the configured frontend origin in Express.
- Correct answers are not returned before submission.
- LLM output is schema-validated before use.
- PDF content is explicitly treated as data rather than instructions in the
  generation prompt.

Current production gaps:

- No authentication or authorization.
- No rate limiting.
- No persistent database for users, documents, or quizzes.
- Qdrant is accessed through its configured server URL.
- Express stores uploaded PDF bytes in memory during forwarding.
- The default Flask CORS policy allows all origins.
- API keys are loaded from a local environment file and must be managed
  securely in deployment.
- No OCR support for scanned PDFs.
- No automated test suite is configured for the Express package.

## 9. Deployment topology

### Local development

```text
Browser
  └── Vite dev server :5173
        └── Express :5000
              └── Flask :8000
                    ├── Qdrant server
                    └── external LLM API
```

### Suggested production topology

```text
Browser
  │
  ▼
HTTPS reverse proxy / frontend host
  │
  ├── Static React assets
  └── Express API service
          │
          ▼
      Flask worker/service
          ├── Managed or durable vector database
          ├── Secret manager
          └── External LLM provider
```

For production, add authentication, HTTPS, rate limiting, structured logging,
durable quiz/document storage, health probes, monitoring, and a managed vector
store or a carefully configured persistent Qdrant deployment.

## 10. Source of truth

- Flask RAG service: [`app.py`](./app.py)
- Express gateway: [`rag based mcq generator/server/server.js`](./rag%20based%20mcq%20generator/server/server.js)
- React UI: [`rag based mcq generator/frontend/src/app.jsx`](./rag%20based%20mcq%20generator/frontend/src/app.jsx)
- Frontend entry point: [`rag based mcq generator/frontend/src/main.jsx`](./rag%20based%20mcq%20generator/frontend/src/main.jsx)
- Python dependencies: [`ai.requirement.txt`](./ai.requirement.txt)
- Frontend dependencies: [`rag based mcq generator/frontend/package.json`](./rag%20based%20mcq%20generator/frontend/package.json)
- Express dependencies: [`rag based mcq generator/server/package.json`](./rag%20based%20mcq%20generator/server/package.json)
