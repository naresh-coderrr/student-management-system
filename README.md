# Student Management System

A modern, production-grade Student Management System featuring dynamic schema generation, Supabase PostgreSQL persistence, a professional Next.js + shadcn/ui frontend, and an intelligent Gemini-powered LLM assistant with human-in-the-loop confirmation and RAG-based interactive help.

---

## 🌟 Key Features

1. **Dynamic Table Builder**
   - Create and customize tables on the fly (define column names, data types, primary keys, uniqueness, and defaults).
   - Alter schemas: add/drop columns, rename tables and columns, and modify data types dynamically.

2. **Smart Data Manager (CRUD)**
   - View, search, sort, and paginate through records with an interactive data grid.
   - Inline and modal editing for table records with automatic audit tracking.
   - Bulk insert and CSV export functionality.

3. **AI Assistant with Confirmation Workflow**
   - Natural language SQL and record operations powered by **Google Gemini**.
   - **Safety-First Human Confirmation**: For data modifications (e.g., updating a student's name or dropping records), the assistant first fetches and displays the existing record, shows the proposed SQL query, and requests explicit user authentication before executing.

4. **RAG (Retrieval-Augmented Generation) Help System**
   - Embedded vector store (ChromaDB) indexing comprehensive system documentation.
   - Ask any question about using the system and receive accurate, context-aware answers.

5. **Comprehensive Activity & Audit Log**
   - Every DDL (schema change) and DML (data modification) action is recorded with old values, new values, timestamps, and executor details.

6. **Enterprise Authentication**
   - Integrated with Supabase Auth for secure management staff access.

---

## 🏗️ Architecture

```
├── frontend/                  # Next.js 16 + React 19 + shadcn/ui + Tailwind CSS
│   ├── src/app/               # App Router pages (Auth, Studio, Tables, Records, Activity)
│   ├── src/components/        # UI components & Hover AI Chatbot
│   └── src/lib/               # API clients, event bus, and TypeScript types
│
├── backend/                   # Python FastAPI Backend
│   ├── routers/               # Endpoints for Auth, Tables, Records, Audit, and LLM
│   ├── services/              # Supabase RPC client, Gemini LLM service, ChromaDB RAG
│   ├── rag_docs/              # Markdown guides indexed into ChromaDB
│   └── setup.sql              # Supabase stored procedures and schema initialization
│
└── vercel.json                # Deployment configuration
```

---

## 🚀 Getting Started

### 1. Database Setup (Supabase)
1. Open your [Supabase Dashboard](https://supabase.com).
2. Go to the **SQL Editor**.
3. Run the contents of `backend/setup.sql`. This sets up the necessary RPC procedures (`exec_sql`, `get_user_tables`, `get_table_columns`, `log_audit`, etc.) and the `audit_log` table.

### 2. Backend Setup
```bash
cd backend
python -m venv venv
# On Windows:
.\venv\Scripts\activate
# On Linux/macOS:
source venv/bin/activate

pip install -r requirements.txt
```

Create a `.env` file in `backend/` based on `backend/.env.example`:
```env
SUPABASE_URL=https://<your-project>.supabase.co
SUPABASE_PUBLISHABLE_KEY=<your-publishable-key>
SUPABASE_SECRET_KEY=<your-secret-key>
GEMINI_API_KEY=<your-gemini-api-key>
BACKEND_PORT=8000
FRONTEND_URL=http://localhost:3000
```

Start the backend:
```bash
python main.py
```
Backend API will be running at `http://localhost:8000`.

### 3. Frontend Setup
```bash
cd frontend
npm install
npm run dev
```
Open `http://localhost:3000` in your browser.

---

## 🛡️ Security & Best Practices
- **No Direct Browser Access to Service Secrets**: All privileged database operations and LLM actions pass through the authenticated FastAPI backend.
- **SQL Sanitization**: All table and column names are quoted and verified against schema catalogs to prevent SQL injection.
- **Human-in-the-Loop Confirmation**: Destructive actions triggered via natural language require user re-authentication and preview confirmation.
