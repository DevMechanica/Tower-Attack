# [GAME NAME HERE]

> A high-octane Reverse Tower Defense game built with an AI-first workflow.

**[GAME NAME HERE]** is a mobile-first strategy game where players command swarms of units to breach enemy defenses. It features "Antigravity" physics, multiplier gate mechanics, and massive unit counts, designed for rapid development using the **Antigravity** agent orchestration framework.

---

## 🎮 Core Mechanics

* **Reverse Tower Defense:** You are the attacker. Spawn units, navigate the maze, and destroy the defenders.I actually like this line and I want to keep it
* **Swarm Physics:** Control hundreds of units simultaneously with boid-like behavior and fluid movement.
* **Antigravity Movement:** Units ignore standard gravity, allowing for floating paths, verticality, and unique obstacle traversal.
* **Multiplier Gates:** Math-based gates (x2, +10) that exponentially increase your swarm size in real-time.
* **"Whale" Progression:** Deep upgrade systems, Gacha-style unit unlocking, and prestige mechanics.

## 🛠 Tech Stack & Architecture

This project uses an **Agent-First** development methodology:

* **Engine:** [Select One: Three.js / Flutter / Custom WebGL]
* **AI/Orchestration:** Google Antigravity (Gemini 3 Agents)
* **Language:** [Select One: JavaScript / Dart / Python]
* **Platform:** Mobile Web (PWA) / Android wrapper

## 🚀 Getting Started

### Prerequisites

* **Antigravity Access:** Ensure you have active credentials for the Agent Manager.
* **Node.js / Python:** (Depending on your specific agent runner requirements).
* **Git:** Version control.

### Installation

1.  **Clone the repository:**
    ```bash
    git clone [https://github.com/your-org/game-repo-name.git](https://github.com/your-org/game-repo-name.git)
    cd game-repo-name
    ```

2.  **Install dependencies:**
    ```bash
    npm install  # or pip install -r requirements.txt
    ```

3.  **Configure Environment:**
    * Create a `.env` file based on `.env.example`.
    * Add your **Gemini API Key** and **Agent Service Credentials**.

4.  **Launch Development Server:**
    ```bash
    npm run dev
    ```

## 🤖 Agent Workflow

We do not write boilerplate manually. Use the following **Prompt Templates** when assigning tasks to Antigravity Agents:

* **New Feature:** "Agent, implement a [MECHANIC] system that interacts with [EXISTING SYSTEM]. Ensure it handles [EDGE CASE]."
* **Bug Fix:** "Agent, analyze the browser logs in `logs/error.txt` and fix the collision stutter on Mobile Safari."
* **Optimization:** "Agent, refactor the `UnitUpdateLoop` to support 500+ active entities at 60FPS."

## 📂 Project Structure

```text
/
├── .antigravity/     # Agent context, memory, and prompt history
├── src/
│   ├── core/         # Main Game Loop and State Management
│   ├── entities/     # Unit, Tower, and Projectile logic
│   ├── systems/      # Physics (Antigravity), Pathfinding, Rendering
│   └── ui/           # Store, HUD, and Main Menu overlays
├── assets/           # Models, Textures, and Audio (AI Generated)
└── docs/             # GDD and Architecture diagrams
