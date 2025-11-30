# SuiteWaste OS

A desktop-style PWA for the waste management sector, featuring a multi-window OS interface and AI-powered workflow applications.

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/VuDube/suitewaste-os1)

SuiteWaste OS is an advanced, desktop-style Progressive Web App (PWA) designed for the South African waste management sector. It provides a comprehensive suite of tools within a familiar, intuitive desktop environment, running entirely in the browser. The OS shell features a window manager for running multiple applications simultaneously, a taskbar for quick app switching, a start menu for launching tools, virtual desktops for organizing workflows, and a notification center for real-time alerts. Integrated applications cover core industry needs: Operations (route planning, live tracking), Compliance (AI-driven checklists), Payments (cashless transactions), an e-Waste Marketplace, interactive Training modules, and real-time Dashboards. The entire experience is powered by an integrated AI Assistant, built on Cloudflare Agents, that provides contextual help, automates tasks, and offers data-driven insights, creating a 'self-driving' frontend experience.

## Key Features

-   **Complete Desktop Environment:** A familiar multi-window, draggable, and resizable interface that runs in the browser.
-   **Core OS Shell:** Includes a persistent Taskbar, a Start Menu for launching applications, and a Notification Center for real-time alerts.
-   **Integrated Application Suite:**
    -   **Operations:** Manage routes and track vehicles on an interactive map.
    -   **Compliance:** Stay up-to-date with AI-powered regulatory checklists.
    -   **Payments:** Handle secure, cashless transactions.
    -   **e-Waste Marketplace:** A platform for the circular economy.
    -   **Training Hub:** Access interactive and gamified learning modules.
    -   **Dashboards:** Visualize real-time KPI and ESG metrics.
-   **AI-Powered Assistant:** A "self-driving" frontend experience powered by Cloudflare Agents for contextual help and task automation.
-   **Built on Cloudflare:** Leverages Cloudflare Workers and Durable Objects for a robust, scalable, and serverless backend.

## Technology Stack

-   **Frontend:** React 18, Vite, TypeScript, Tailwind CSS
-   **UI Components:** shadcn/ui, Framer Motion, Lucide React
-   **State Management:** Zustand
-   **Backend:** Cloudflare Workers, Hono
-   **Persistence:** Cloudflare Durable Objects
-   **AI:** Cloudflare Agents, Cloudflare AI Gateway

## Getting Started

Follow these instructions to get the project up and running on your local machine for development and testing purposes.

### Prerequisites

-   [Bun](https://bun.sh/) installed on your machine.
-   A [Cloudflare account](https://dash.cloudflare.com/sign-up).
-   [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/install-and-update/) installed and authenticated.

### Installation

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/your-username/suitewaste-os.git
    cd suitewaste-os
    ```

2.  **Install dependencies:**
    ```bash
    bun install
    ```

3.  **Set up environment variables:**

    Create a `.dev.vars` file in the root of the project for local development. You can copy the example below.

    ```ini
    # .dev.vars

    # Cloudflare AI Gateway URL
    # Format: https://gateway.ai.cloudflare.com/v1/YOUR_ACCOUNT_ID/YOUR_GATEWAY_NAME/openai
    CF_AI_BASE_URL="your-cloudflare-ai-gateway-url"

    # Cloudflare AI Gateway API Key
    CF_AI_API_KEY="your-cloudflare-api-key"
    ```

    These variables are required for the AI chat functionality to work.

## Development

To start the local development server, which includes the Vite frontend and the Wrangler server for the worker, run:

```bash
bun dev
```

This will start the frontend application (typically on `http://localhost:3000`) and the Cloudflare Worker backend. The Vite development server is configured to proxy all API requests (`/api/*`) to the local worker instance.

## Usage

Once the application is running, you can interact with it like a standard desktop operating system:
-   Click the **Start Menu** icon on the taskbar to see and launch applications.
-   Open multiple applications, which will appear as draggable and resizable windows.
-   Switch between open applications using the icons on the taskbar.
-   Use the AI Assistant for help or to automate tasks.

## Deployment

This project is designed for easy deployment to Cloudflare Pages.

1.  **Build the project:**
    ```bash
    bun build
    ```

2.  **Deploy to Cloudflare:**
    ```bash
    bun deploy
    ```

This command will build the frontend application and deploy both the static assets and the worker functions to your Cloudflare account.

Alternatively, you can deploy directly from your GitHub repository using the button below.

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/VuDube/suitewaste-os1)

## Project Structure

-   `src/`: Contains all the React frontend code, including pages, components, hooks, and utility functions.
-   `worker/`: Contains the Cloudflare Worker backend code, including the Hono router, Durable Object classes (`ChatAgent`, `AppController`), and AI integration logic.
-   `wrangler.jsonc`: Configuration file for the Cloudflare Worker, including bindings and migrations.
-   `vite.config.ts`: Configuration for the Vite development server and build process.

## Contributing

Contributions are welcome! Please feel free to open an issue or submit a pull request.

1.  Fork the Project
2.  Create your Feature Branch (`git checkout -b feature/AmazingFeature`)
3.  Commit your Changes (`git commit -m 'Add some AmazingFeature'`)
4.  Push to the Branch (`git push origin feature/AmazingFeature`)
5.  Open a Pull Request

## License

This project is licensed under the MIT License.