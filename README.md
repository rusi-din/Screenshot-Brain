# Hacktoberfest Weekend Challenge: Build for a Friend

## Screenshot Brain

Screenshot Brain is a local-first screenshot search engine for people who save useful information as images and then struggle to find it again.

Upload screenshots, extract their text, automatically organise them, and search them using the words you remember rather than the folders where they were saved. The core workflow runs on open-source tools on your computer:

```text
Screenshot -> Tesseract OCR -> Ollama analysis -> SQLite index -> Keyword or semantic search
```

The project was built for the **Hacktoberfest Weekend Challenge: Build for a Friend**. It is designed to be practical for everyday use, easy to run locally, and understandable enough for contributors to extend.

## The problem it solves

Screenshots often contain receipts, travel details, study notes, booking confirmations, messages, and other information that is difficult to locate later. Filename-based folders do not capture what is inside an image.

Screenshot Brain turns those images into a searchable personal knowledge base. Instead of remembering a filename, you can search for things such as:

- `my upcoming flight`
- `the keyboard I ordered`
- `restaurant reservation for Saturday`
- `notes about local AI`

## Features

| Feature | Description |
| --- | --- |
| Screenshot upload | Drag and drop one or many PNG or JPG files. Files can be up to 25 MB each. |
| Local OCR | Tesseract extracts readable text from each screenshot. |
| AI enrichment | Ollama creates a title, summary, keywords, and category. |
| Keyword search | Searches titles, summaries, categories, and extracted OCR text. |
| Semantic search | Uses Ollama embeddings and cosine similarity to search by meaning. |
| Ask AI | Ask questions about the extracted text in a screenshot. |
| Categories | Screenshots are organised into Receipt, Travel, Shopping, Study, Notes, Finance, Booking, or Miscellaneous. |
| Voice search | Optional microphone search using ElevenLabs Scribe. |
| Read aloud | Optional text-to-speech for summaries, OCR text, and AI answers. |
| Runtime model switching | Choose any pulled Ollama model from the interface. |
| Analytics | View totals, category breakdowns, search history, and recent uploads. |
| Demo walkthrough | Explore the application features through the built-in Demo view. |
| Storage options | SQLite is the default; MongoDB Atlas is supported as an optional cloud backend. |

## Privacy model

By default, OCR, AI analysis, embeddings, and storage run locally. No API key is required for the core workflow, and SQLite stores data on the local machine.

Optional services change this behavior:

- ElevenLabs receives audio or text when voice search or read-aloud is used.
- MongoDB Atlas stores screenshot metadata and OCR data in the configured cloud database.

## Technology stack

- React and Vite for the frontend
- FastAPI and Uvicorn for the backend API
- Tesseract OCR for local text extraction
- Ollama for local AI analysis and embeddings
- SQLite for default local storage
- MongoDB Atlas as an optional storage provider
- ElevenLabs as an optional speech-to-text and text-to-speech provider
- Lucide React for interface icons

## Requirements

- Node.js and npm
- Python 3.10 or newer
- Tesseract OCR
- Ollama
- Optional: an ElevenLabs API key for voice features
- Optional: a MongoDB Atlas connection string for cloud storage

## Quick start

The frontend and backend run as separate processes. Open two terminals in the project directory.

### 1. Install Tesseract and Ollama

On Windows:

```powershell
winget install UB-Mannheim.TesseractOCR
```

On macOS:

```bash
brew install tesseract
```

On Ubuntu or Debian:

```bash
sudo apt install tesseract-ocr
```

Install Ollama from [ollama.com/download](https://ollama.com/download).

### 2. Start the frontend

From the project root:

```bash
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173).

### 3. Set up and start the backend

From the project root:

```powershell
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
ollama pull llama3.2:1b
uvicorn main:app --reload --port 8000
```

On macOS or Linux, activate the environment with:

```bash
source .venv/bin/activate
```

The default frontend expects the API at `http://localhost:8000`. The top-right status indicator should report `OCR + AI ready` when Tesseract, Ollama, and the backend are available.

## How to use the application

### Upload screenshots

1. Click **Add screenshots** or **Inbox**.
2. Drop files into the upload area, or click the area to browse.
3. Wait for the upload, OCR, AI analysis, and indexing process to finish.
4. Open a result card to inspect the screenshot.

The interface shows a temporary processing card while the backend works. Uploaded files are stored under `backend/data/uploads/` with generated filenames.

### Search

Use the main search field to search titles, summaries, categories, and OCR text. Keyword search does not require special syntax.

To use semantic search:

1. Pull the embedding model:

   ```bash
   ollama pull nomic-embed-text
   ```

2. Upload screenshots while the backend is running, or re-index existing screenshots from **Settings -> AI / LLM -> Re-index embeddings**.
3. Click the **Keyword** toggle beside the search field until it changes to **Semantic**.
4. Type a natural description of what you remember. No special operators, quotes, or syntax are required.

For example, `food delivery payment` can find an Uber Eats receipt even when those exact words are not present together in the screenshot.

Semantic search ranks results using cosine similarity. If embeddings are unavailable, the backend falls back to returning the first available candidates rather than failing completely.

### Inspect a screenshot

Click a card to open its detail view:

- **Details** shows the generated title, summary, category, date, and OCR word count.
- **OCR text** shows the full extracted text and provides copy and optional read-aloud actions.
- **Ask AI** answers questions using the screenshot's extracted text.
- **Copy text** copies OCR text to the clipboard.
- **Delete** removes the screenshot from storage.
- **Read aloud** generates audio for the summary when ElevenLabs is configured.

### Organise the library

Use the sidebar or filter buttons to browse categories. **New group** creates a custom UI group for the current session. The built-in categories are Receipt, Travel, Study, Shopping, Notes, Finance, and Booking.

### Analytics and walkthrough

- Open **Analytics** to view total screenshots, semantic searches, total searches, category counts, top search terms, and recent uploads.
- Open **Demo** for a guided walkthrough of upload, OCR, AI analysis, categories, semantic search, voice search, and audio playback.

## Configuration

The backend reads these environment variables at startup. Settings can also be changed at runtime from the **Settings** dialog.

```env
# Ollama analysis model
OLLAMA_MODEL=llama3.2:1b

# Ollama embedding model
OLLAMA_EMBED_MODEL=nomic-embed-text

# Optional explicit path to the Tesseract executable
TESSERACT_CMD=

# Optional ElevenLabs configuration
ELEVENLABS_API_KEY=your_key_here
ELEVENLABS_VOICE_ID=EXAVITQu4vr4xnSDxMaL

# Optional MongoDB Atlas connection string
MONGODB_URI=mongodb+srv://user:password@cluster.mongodb.net/screenshot_brain
```

On Windows PowerShell, variables can be set before starting the API:

```powershell
$env:ELEVENLABS_API_KEY = "sk-..."
$env:MONGODB_URI = "mongodb+srv://..."
uvicorn main:app --reload --port 8000
```

### AI models

The default model is `llama3.2:1b`. It is used for categorisation, summaries, and screenshot Q&A. Pull another model and select it from the top-right model picker:

```bash
ollama pull gemma3:1b
ollama pull qwen2.5:1.5b
ollama pull mistral:7b
```

### Voice features

Voice search and read-aloud require `ELEVENLABS_API_KEY`. After configuring the key, restart the backend or save the key through **Settings -> Voice**. The microphone control appears in the search bar when voice support is available.

### MongoDB Atlas

SQLite is used when `MONGODB_URI` is empty. To enable MongoDB Atlas:

1. Create a cluster at [MongoDB Atlas](https://cloud.mongodb.com).
2. Add the connection string in `MONGODB_URI` or **Settings -> Storage**.
3. Test the connection and apply the setting.

To migrate existing SQLite data, run this from the `backend` directory:

```bash
MONGODB_URI="mongodb+srv://..." python migrate_to_mongo.py
```

## API reference

The API runs at `http://localhost:8000`.

| Method | Endpoint | Description |
| --- | --- | --- |
| `GET` | `/api/health` | Reports OCR, AI, voice, storage, and model status. |
| `GET` | `/api/settings` | Returns current configuration with secrets masked. |
| `POST` | `/api/settings` | Updates runtime configuration. |
| `POST` | `/api/settings/test-tesseract` | Tests the Tesseract configuration. |
| `POST` | `/api/settings/test-elevenlabs` | Tests ElevenLabs connectivity. |
| `POST` | `/api/settings/test-mongodb` | Tests a MongoDB connection. |
| `POST` | `/api/model` | Switches the active Ollama analysis model. |
| `GET` | `/api/screenshots` | Lists screenshots and supports keyword filtering. |
| `GET` | `/api/screenshots/{id}` | Returns one screenshot record. |
| `POST` | `/api/screenshots` | Uploads and indexes a screenshot. |
| `DELETE` | `/api/screenshots/{id}` | Deletes a screenshot. |
| `POST` | `/api/screenshots/{id}/ask` | Answers a question using extracted screenshot text. |
| `POST` | `/api/search/semantic` | Performs embedding-based semantic search. |
| `POST` | `/api/embeddings/reindex` | Regenerates embeddings for stored screenshots. |
| `POST` | `/api/voice/speak/{id}` | Generates speech for a screenshot summary. |
| `POST` | `/api/voice/speak-text` | Generates speech for supplied text. |
| `POST` | `/api/voice/transcribe` | Transcribes an uploaded audio recording. |
| `GET` | `/api/analytics` | Returns dashboard metrics and search history. |

## Project structure

```text
Screenshot Brain/
├── src/
│   ├── App.jsx              # Main React application and search flow
│   ├── VoiceSearch.jsx      # Browser recording and speech-to-text
│   ├── AudioPlayer.jsx      # Audio playback controls
│   ├── AnalyticsDashboard.jsx
│   ├── DemoPage.jsx         # Feature walkthrough
│   ├── SettingsModal.jsx    # Runtime configuration
│   ├── main.jsx
│   └── styles.css
├── backend/
│   ├── main.py              # FastAPI routes and processing pipeline
│   ├── db.py                # SQLite and MongoDB repository layer
│   ├── embeddings.py        # Embedding generation and cosine search
│   ├── voice.py             # ElevenLabs speech integrations
│   ├── migrate_to_mongo.py  # SQLite to MongoDB migration script
│   ├── requirements.txt
│   └── data/uploads/        # Uploaded image files
├── public/screenshots/      # Starter/demo screenshot assets
├── docs/
│   └── copilot-usage.md     # GitHub Copilot usage log
├── index.html
├── package.json
└── README.md
```

## Development commands

```bash
# Start Vite development server
npm run dev

# Create a production frontend build
npm run build

# Preview the production build
npm run preview
```

Backend tests are located in `backend/test_main.py`. Run them from the project root after activating the backend virtual environment:

```bash
python -m pytest backend/test_main.py
```

## Troubleshooting

### The UI says Backend offline

Confirm that Uvicorn is running on port 8000:

```bash
uvicorn main:app --reload --port 8000
```

Run it from the `backend` directory so Python can import the local modules.

### OCR text is empty

Install Tesseract and confirm that it is available on the system path. If it is installed somewhere non-standard, set `TESSERACT_CMD` or configure the path under **Settings -> OCR**. Re-upload the screenshot after fixing OCR.

### AI summaries are missing or generic

Make sure Ollama is running and that the selected model has been pulled:

```bash
ollama list
ollama pull llama3.2:1b
```

The backend has a keyword-based metadata fallback when Ollama is unavailable.

### Semantic results are not useful

Confirm that `nomic-embed-text` is pulled, then use **Settings -> AI / LLM -> Re-index embeddings** for screenshots uploaded before the embedding model was available.

### Voice controls are not visible

Configure an ElevenLabs API key, save the setting, and refresh the health status. Browser microphone permission is also required for voice search.

## Contributing

Contributions are welcome, especially improvements that make screenshot organisation more useful for everyday workflows.

Suggested contribution areas:

- Better OCR preprocessing for low-quality screenshots
- More categories and custom categorisation rules
- Additional local embedding models
- Importers for browser or phone screenshot folders
- Accessibility and keyboard navigation improvements
- Tests for storage, search, and optional-service failure paths

Keep changes focused, preserve the local-first default, and update this README when setup or user-facing behavior changes.

## Hacktoberfest submission notes

This project demonstrates how open-source AI can solve a small but recurring personal problem without requiring a hosted AI service for the core experience.

The development process and examples of GitHub Copilot usage are documented in [docs/copilot-usage.md](docs/copilot-usage.md).

## License

No license file is currently included in this repository. Add a project license before distributing the code outside the challenge submission.
