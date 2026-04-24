# Knowledge Graph Extractor

A full-stack web application that automatically extracts entities and relationships from unstructured text and visualizes them as an interactive knowledge graph.

Built with **free, open-source NLP tools** and **free-tier AI APIs** -- no paid subscriptions required.

![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=flat&logo=typescript&logoColor=white)
![React](https://img.shields.io/badge/React_19-61DAFB?style=flat&logo=react&logoColor=black)
![Node.js](https://img.shields.io/badge/Node.js-339933?style=flat&logo=node.js&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-38B2AC?style=flat&logo=tailwind-css&logoColor=white)

## Features

- **Entity Extraction** -- Uses Hugging Face's BERT-based NER model (`dslim/bert-base-NER`) to identify people, organizations, locations, and concepts
- **Relationship Extraction** -- Leverages free-tier LLMs via OpenRouter to discover connections between entities
- **Interactive Graph Visualization** -- Force-directed graph powered by D3.js with hover effects, zoom, pan, and search
- **AI-Powered Explanations** -- Click any node to get an AI-generated description
- **URL Scraping** -- Paste a URL to automatically extract text from any webpage
- **PDF/File Upload** -- Upload `.pdf`, `.txt`, or `.md` files for analysis
- **Graph History & Undo** -- Navigate between previous graph states
- **Export** -- Download your graph as JSON data or PNG image
- **API Settings UI** -- Configure API keys directly from the browser
- **Fully Responsive** -- Dark-themed UI with canvas-based rendering

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, TypeScript, Tailwind CSS 4, Vite |
| Backend | Express.js, Node.js, TypeScript |
| NLP | Hugging Face Inference API (BERT NER) |
| AI | OpenRouter (free-tier LLMs with automatic fallback) |
| Visualization | react-force-graph-2d (D3.js) |
| Animations | Motion (Framer Motion) |
| Icons | Lucide React |

## Architecture

```
User Input (text / URL / PDF)
        |
        v
  [Express Server]
        |
        +---> Hugging Face API (Entity Extraction - NER)
        |
        +---> OpenRouter API (Relationship Extraction - Free LLM)
        |
        v
  [React Frontend]
        |
        v
  Interactive Force-Directed Graph (D3.js)
```

## Quick Start

### Prerequisites

- Node.js 18+
- npm

### 1. Clone the repository

```bash
git clone https://github.com/YOUR_USERNAME/knowledge-graph-extractor.git
cd knowledge-graph-extractor
```

### 2. Install dependencies

```bash
npm install
```

### 3. Get free API keys

| Service | URL | What You Need |
|---------|-----|--------------|
| Hugging Face | https://huggingface.co/settings/tokens | Create a token with "Inference Providers" permission |
| OpenRouter | https://openrouter.ai/keys | Create a free API key (no credit card required) |

### 4. Configure environment

```bash
cp .env.example .env
```

Edit `.env` and add your keys:

```env
HUGGINGFACE_TOKEN="hf_your_token_here"
OPENROUTER_API_KEY="sk-or-your_key_here"
```

Or configure keys directly in the app's **API Settings** panel.

### 5. Run the app

```bash
npm run dev
```

Open http://localhost:3000

## Usage

1. **Paste text** into the input area, or use **URL scraping** or **file upload**
2. Click **Extract** to generate the knowledge graph
3. **Hover** over nodes to highlight their connections
4. **Click** a node to see an AI-generated explanation
5. Use **Search** to find and zoom to specific entities
6. **Export** your graph as JSON or PNG
7. Use **Undo** to return to previous graph states

## Example Texts

```
Albert Einstein developed the theory of relativity while working at the
University of Berlin. He received the Nobel Prize in Physics in 1921.
Einstein later moved to the United States and joined Princeton University.
His work influenced Robert Oppenheimer, who led the Manhattan Project in Los Alamos.
```

```
Elon Musk founded SpaceX and Tesla. SpaceX builds rockets for NASA.
Tesla produces electric vehicles in California. Jeff Bezos founded Amazon
and Blue Origin. Amazon acquired Whole Foods in 2017.
```

## API Cost

**$0** -- This project uses only free-tier APIs:

- Hugging Face Inference API: Free tier with rate limits
- OpenRouter: Free models (Gemma, LLaMA, Nemotron, etc.) with automatic failover across 9 models

## Project Structure

```
knowledge-graph-extractor/
|-- server.ts          # Express backend with API endpoints
|-- src/
|   |-- App.tsx        # React frontend (graph, UI, interactions)
|   |-- main.tsx       # React entry point
|   |-- index.css      # Global styles
|-- index.html         # HTML entry point
|-- .env.example       # Environment variables template
|-- package.json
|-- tsconfig.json
|-- vite.config.ts
```

## Building for Production

```bash
npm run build
npm start
```

## Deployment

This app requires a Node.js server (Express backend). Deploy on:

- **Render** (recommended, free tier) -- connect GitHub repo, set build command to `npm run build`, start command to `npm start`
- **Railway** -- similar to Render
- **Vercel** -- use `vercel.json` with serverless functions

> **Note:** Pure static hosting (Netlify, GitHub Pages) won't work because this app has a Node.js backend for API proxying.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

MIT
