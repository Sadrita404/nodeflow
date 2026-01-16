# NodeFlow
<img alt="Screenshot 2025-11-29 at 11 40 41 PM" src="https://res.cloudinary.com/diyxwdtjd/image/upload/v1764481422/projects/Screenshot_2025-11-30_at_11.13.33_AM_npqcsm.png" />
Web3 Workflow Builder for Aptos

NodeFlow is a visual workflow automation tool for the Aptos blockchain, inspired by tools like n8n. It allows developers to visually build workflows, compile Move smart contracts, and deploy them to Aptos — all through an intuitive node-based interface.

---

# Demo Video Link
[Demo Video](https://youtu.be/a_33riNJSkw)

---

# Project PPT Link
[Project Presentation](https://drive.google.com/file/d/1N5Wczs_jf63BKkSDp-wPcszMlJG63-1f/view?usp=sharing)

---

# Project Overview

NodeFlow is built with:

* **Next.js + TailwindCSS** → Modern frontend & UI
* **Move** → Smart contract language for Aptos
* **TypeScript** → Type-safe development
* **@aptos-labs/ts-sdk** → Aptos blockchain interactions
* **Petra Wallet** → Wallet connection for Aptos
* **React Flow** → Visual workflow builder
* **OpenAI API** → Optional AI-powered contract analysis
* **Aptos CLI** → Move contract compilation (server-side)

---

# Features

## Workflow & Automation
* Visual node-based workflow builder
* Drag-and-drop interface similar to n8n / Zapier
* Real-time execution logs & result tracking
* Sequential workflow execution with dependency management

## Move Smart Contract Management
* Write and edit Move contract code directly in the app
* Compile Move modules using Aptos CLI
* Deploy Move modules to Aptos testnet
* Extract ABI and bytecode from compiled contracts
* Pre-built contract templates (Token, NFT, Crowdfunding, MultiSig, Voting, Staking)

## Wallet & Connectivity
* Connect to Petra wallet (Aptos native wallet)
* View wallet balance and address
* Sign and submit transactions directly from the app
* Network selection (currently supports Aptos Testnet)

## AI-Powered Analysis (Optional)
* AI-assisted contract security auditing
* Contract vulnerability analysis using OpenAI
* Customizable AI prompts for contract analysis

---

# Tech Stack

| Layer           | Technology                          |
| --------------- | ----------------------------------- |
| Frontend        | Next.js 15, React 19, TailwindCSS  |
| Backend         | Next.js API Routes, TypeScript     |
| Smart Contracts | Move (Aptos)                        |
| Blockchain SDK  | @aptos-labs/ts-sdk                  |
| Wallet          | Petra Wallet (window.aptos API)     |
| Workflow Engine | Custom TypeScript executor          |
| UI Components   | React Flow, Framer Motion           |
| State Management| Zustand                             |
| AI Analysis     | OpenAI API (optional)                |
| Compilation     | Aptos CLI (server-side)             |

---

# Project Structure

```
NodeFlow/
├── app/                      # Next.js app router pages & routes
│   ├── api/
│   │   └── compile/          # Move compilation API endpoint
│   ├── page.tsx              # Main application page
│   ├── layout.tsx            # Root layout
│   └── globals.css           # Global styles
├── components/               # React components
│   ├── WorkflowBuilder.tsx   # Main workflow canvas
│   ├── Sidebar.tsx           # Node library sidebar
│   ├── TopBar.tsx            # Top navigation bar
│   ├── NodeConfigPanel.tsx   # Node configuration panel
│   ├── nodes/                # Custom node components
│   └── edges/                # Custom edge components
├── lib/                      # Core libraries
│   ├── blockchainService.ts  # Aptos blockchain interactions
│   ├── walletService.ts     # Petra wallet integration
│   ├── workflowExecutor.ts  # Workflow execution engine
│   ├── contractCompiler.ts  # Move compilation logic
│   ├── contractTemplates.ts # Pre-built contract templates
│   ├── openaiService.ts     # AI analysis service (optional)
│   └── templateWorkflowGenerator.ts # Template workflow generator
├── store/                     # State management
│   └── workflowStore.ts      # Zustand store for workflow state
├── types/                     # TypeScript type definitions
│   └── nodes.ts              # Node type definitions
├── public/                    # Static assets
│   └── logo.svg              # Application logo
├── package.json
├── tsconfig.json
├── tailwind.config.ts
├── next.config.ts
└── README.md
```

---

# Architecture

The following diagram illustrates the system architecture of NodeFlow:

<img alt="NodeFlow Architecture Diagram" src="https://res.cloudinary.com/diyxwdtjd/image/upload/v1764484582/projects/Screenshot_2025-11-30_at_12.06.00_PM_rlgudy.png" />

## Architecture Overview

NodeFlow follows a layered architecture pattern:

1. **Frontend Layer** - React Flow-based visual workflow builder with drag-and-drop interface
2. **State Management** - Zustand store managing workflow state, nodes, edges, and execution state
3. **Workflow Execution Engine** - Custom TypeScript executor that processes nodes sequentially with dependency resolution
4. **Service Layer** - Handles compilation (Aptos CLI), blockchain interactions (Aptos SDK), wallet integration (Petra), and AI analysis (OpenAI)
5. **Blockchain Layer** - Aptos Testnet for Move module deployment and transaction execution

The architecture ensures separation of concerns, making the system modular, maintainable, and scalable.

---

# Project Setup Instructions

## 1) Install Prerequisites

* **VS Code** (recommended)
  ```
  https://code.visualstudio.com/download
  ```

* **Node.js** (v20 recommended)
  ```
  https://nodejs.org/en/download
  ```

* **Aptos CLI** (required for contract compilation)
  ```
  https://aptos.dev/tools/aptos-cli/install-cli/
  ```
  
  Or install via:
  ```bash
  curl -fsSL "https://aptos.dev/scripts/install_cli.py" | python3
  ```

* **Petra Wallet** (browser extension)
  ```
  https://petra.app/
  ```

---

## 2) Clone the Repository

```bash
git clone <repository-url>
cd chainflow
```

---

## 3) Install Dependencies

```bash
npm install
# or
pnpm install
```

---

## 4) Configure Environment Variables

Create a `.env.local` file in the root directory:

```env
# Optional: Aptos API key for rate limit protection
# Get one at: https://geomi.dev/docs/start
NEXT_PUBLIC_APTOS_API_KEY=your_api_key_here

# Optional: OpenAI API key for AI contract analysis
NEXT_PUBLIC_OPENAI_API_KEY=your_openai_api_key_here

# Optional: Custom Aptos RPC URL (defaults to testnet)
NEXT_PUBLIC_APTOS_RPC=https://testnet.aptoslabs.com/v1
```

**Note:** All environment variables are optional. The app will work without them, but:
- Without `NEXT_PUBLIC_APTOS_API_KEY`: You may hit rate limits when interacting with Aptos
- Without `NEXT_PUBLIC_OPENAI_API_KEY`: AI analysis features will be unavailable

---

## 5) Start the Development Server

```bash
npm run dev
# or
pnpm dev
```

Your app will run at:
```
http://localhost:3000
```

---

# How to Use

## Creating a Workflow

1. **Create a Project**: Click "New Project" in the top bar
2. **Add Nodes**: Drag nodes from the sidebar onto the canvas
3. **Connect Nodes**: Connect nodes by dragging from output handles to input handles
4. **Configure Nodes**: Click on a node to configure its properties
5. **Run Workflow**: Click the "Run" button in the sidebar to execute the workflow

## Available Node Types

* **Create Project** - Initialize a new project
* **Contract Input** - Write or paste Move contract code
* **Compile Contract** - Compile Move code using Aptos CLI
* **Generate ABI** - Extract ABI from compiled contract
* **Generate Bytecode** - Extract bytecode from compiled contract
* **Deploy Contract** - Deploy Move module to Aptos testnet
* **AI Audit** - Analyze contract using OpenAI (optional)
* **Workflow Complete** - Display execution summary

## Using Contract Templates

1. Click the "Templates" tab in the sidebar
2. Select a template (Token, NFT, Crowdfunding, etc.)
3. The template will automatically create a workflow with pre-configured nodes
4. Customize the contract code as needed
5. Run the workflow to compile and deploy

## Connecting Wallet

1. Click "Connect Wallet" in the top bar
2. Approve the connection in Petra wallet popup
3. Your wallet address will be displayed
4. Ensure you have testnet APT tokens for deployment

---

# Important Notes

## Move Contract Requirements

* Move modules must use `Deployer` as the named address
* Format: `module Deployer::<module_name> { ... }`
* The wallet address will be automatically mapped to `Deployer` during compilation

## Compilation

* First compilation may take 1-3 minutes (downloads dependencies)
* Subsequent compilations are much faster (uses cached dependencies)
* Requires Aptos CLI to be installed on the server

## Deployment

* Currently supports Aptos Testnet only
* Requires testnet APT tokens for transaction fees
* Modules are deployed to your connected wallet address

---

# Thanks for Exploring NodeFlow

Thank you for exploring NodeFlow — a visual workflow builder for the Aptos blockchain, enabling fast, secure, and scalable Move-based smart contract development. Your interest and contributions help push the Aptos ecosystem forward!

#  Contributor
 1) Debsourya Datta
 2) Sadrita Neogi
 3) Saptarshi 