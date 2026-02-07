# Technology Stack

## Backend (Server)
- **Language:** Go 1.24+
- **API Framework:** Gorilla Mux (Routing)
- **Database Access:** Masterminds/squirrel (SQL Query Builder)
- **Real-time:** Gorilla WebSocket
- **Logging:** Mattermost Logr
- **Migrations:** Mattermost Morph

## Frontend (Webapp)
- **Language:** TypeScript
- **Framework:** React 17
- **State Management:** Redux Toolkit (@reduxjs/toolkit)
- **Styling:** SCSS, BEM convention
- **Editor Framework:** BlockSuite (Migration in progress)
- **Routing:** React Router DOM (v5)

## Infrastructure & Tools
- **Build System:** Makefile, Webpack
- **Package Manager:** npm
- **Testing (Server):** Go standard `testing` package, Testify
- **Testing (Webapp):** Jest, React Testing Library, Cypress (E2E)
- **Database Support:** PostgreSQL, MySQL, SQLite (via Mattermost Server abstraction)
