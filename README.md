<div align="center">
  <img src="./assets/logo.png" alt="Astra Logo" width="120" />
  <h1>Astra</h1>
  <p><strong>Agentic AI Backtesting Platform</strong></p>
  <p>Design, compile, and validate algorithmic trading strategies using natural language.</p>

  [![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](https://opensource.org/licenses/MIT)
  [![Python 3.10+](https://img.shields.io/badge/python-3.10+-blue.svg)](https://www.python.org/downloads/release/python-3100/)
  [![Next.js](https://img.shields.io/badge/Next.js-14-black)](https://nextjs.org/)
  [![CrewAI](https://img.shields.io/badge/Powered_by-CrewAI-red)](https://crewai.com)
</div>

<br />

**Astra** (formerly Astra AI) is an open-source, dual-engine backtesting platform that uses Large Language Models to convert human intent into deterministic financial mathematics.

Whether you want to explicitly define a strategy ("Buy when RSI < 30") or implicitly ask an AI to invent one ("Maximize returns for Apple momentum"), Astra abstracts the coding away and instantly outputs an institutional-grade performance tearsheet.

---

## ⚡ Core Features

- 🧠 **Dual AI Modalities**: Choose between *Manual Mode* (you describe the logic, an LLM parses it) and *Generative Mode* (a 3-agent CrewAI team invents the logic based on your goal).
- ⛓️‍💥 **The Data Failsafe**: A robust 4-layer market data cascade (Yahoo → Stooq → Alpha Vantage → Synthetic GBM). The system never fails to fetch prices.
- 🧱 **Immutable Execution**: While the strategy *design* is generative, the strategy *execution* strictly uses a deterministic compiler and simulator to guarantee 0% hallucination during trading.
- 📊 **Quant Analytics**: Instantly calculates Sharpe, Sortino, Max Drawdown, Alpha, Profit Factor, and Win Rates, complete with automated LLM risk analysis.
- 🎨 **Neo-brutalist UI**: A beautiful, highly reactive Next.js terminal-style dashboard with live-animated pipeline flows and real-time generation feedback.

---

## 🏗️ System Architecture

Astra strictly follows the principle of **Agentic Separation of Concerns**. The "thinking" agents are explicitly isolated from the "doing" agents.

### The 6-Stage Core Pipeline (Manual Backtesting)

When Astra digests a defined strategy, it pushes data through a strict sequence:
1. **Data Ingestion**: The data adapters retrieve and uniformize historical OHLCV data.
2. **Parser Agent (LLM)**: Groq (LLaMA 3) converts the English text into a strict JSON `StrategySchema`.
3. **Compiler**: Translates the parsed JSON abstract syntax tree into vectorized Pandas boolean signals.
4. **Simulator**: Executes trades day-by-day. Models realistic trading friction (commission deducts, entry slippage).
5. **Analytics Engine**: Computes 12+ industry performance metrics from the simulated equity curve.
6. **Risk Agent (LLM)**: Summarizes the geometric risk and potential blindspots of the specific run.

### The CrewAI Generative Engine (Autonomous Strategy Discovery)

When a user hits **"Generate Strategy"**, Astra summons a specialized 3-agent autonomous crew:

1. **The Market Analyst**: Fetches live trailing price action/volatility and drafts a formal market briefing.
2. **The Strategy Architect**: Ingests the Analyst's briefing and the User's goal (e.g., "Momentum"), and formulates custom mathematical entry/exit parameters. 
3. **The Risk Assessor**: Critiques the drafted signals, maps them to Astra's supported indicators, formats the JSON schema, and outputs a confidence score.
*Failsafe*: If the generated rules yield zero executions, the orchestrator detects the failure and hot-swaps predefined, known-good indicator strategies matched to the user's intent.

---

## 🛠️ Tech Stack

**Frontend**
* Framework: React + Next.js 14 (App Router)
* Styling: Tailwind CSS, custom Neo-brutalist globals
* Charts/Nodes: React Flow, Framer Motion
* Language: TypeScript

**Backend**
* Framework: FastAPI (Python)
* AI Logic: Groq SDK (LLaMA Series), CrewAI, LiteLLM
* Market Data: httpx, yfinance (deprecated in favor of raw http), Alpha Vantage, Stooq
* Quant Engine: Pandas (vectorized calculus), Numpy

---

## 🚀 Quickstart

### Prerequisites
* Node.js >= 18
* Python >= 3.10
* A [Groq API Key](https://console.groq.com) (It's free)

### 1. Backend Setup

```bash
cd backend

# Create virtual environment
python -m venv venv
# Windows:
.\venv\Scripts\activate
# Mac/Linux:
source venv/bin/activate

# Install dependencies (ensure you have numpy, pandas, fastapi, uvicorn, groq, crewai, litellm)
pip install -r requirements.txt

# Create .env file
echo "GROQ_API_KEY=gsk_your_key_here" > .env
# Optional: Add ALPHA_VANTAGE_KEY if you want the 3rd layer of data fallback

# Run the backend server
python -m uvicorn main:app --host 0.0.0.0 --port 8000
```

### 2. Frontend Setup

Open a new terminal window:

```bash
cd frontend

# Install dependencies
npm install

# Run the development server
npm run dev
```

The application will be live at: [http://localhost:3000/dashboard](http://localhost:3000/dashboard).

---

## 🎥 Walkthrough

1. Check out the **Manual Mode**: Open the dashboard, type `"Buy TCS when RSI drops below 30 and sell when it crosses above 70"`, select your lookback period (e.g., 2 years) and click **Run Backtest**.
2. Try the **Generative Mode**: Slide the top toggle to *Generate Strategy*. Type `"Find low-risk mean reversion opportunities in volatile markets"`. Astra's CrewAI will analyze the current market regime, compile custom bounds, run the simulation, and instantly display an itemized, quantifiable report.
3. **Analyze**: Review the interactive Pipeline flow map at the bottom of the screen to trace the exact milliseconds spent in Parsing, Compilation, and Execution.

---

## 🔒 License

This project is licensed under the MIT License - see the LICENSE file for details.
