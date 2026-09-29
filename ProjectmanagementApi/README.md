# Project Management Tool — GTP 2026 Capstone

Built as part of the **Sababisha Solutions Graduate Training Programme (GTP) 2026**.

A production-oriented full-stack Project Management API built with .NET, SQL Server, Entity Framework Core, Dapper, and GraphQL.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Backend Framework | ASP.NET Core Web API (.NET 10) |
| ORM | Entity Framework Core 8 |
| Micro-ORM | Dapper 2.x |
| GraphQL | HotChocolate 14 |
| Database | SQL Server 2022 / 2025 |
| Frontend | React + Vite (in progress) |

---

## Prerequisites

Make sure the following are installed before setting up the project:

- [.NET 10 SDK](https://dotnet.microsoft.com/download/dotnet/10.0)
- [SQL Server 2022 Developer Edition](https://www.microsoft.com/en-us/sql-server/sql-server-downloads) (or SQL Server 2025)
- [Node.js 20 LTS or newer](https://nodejs.org)
- [DBeaver](https://dbeaver.io/) or SSMS (to inspect the database)
- [`dotnet-ef` CLI tool](https://learn.microsoft.com/en-us/ef/core/cli/dotnet):
  ```bash
  dotnet tool install --global dotnet-ef
  ```

---

## Getting Started

### 1. Clone the repository

```bash
git clone https://github.com/<your-username>/ProjectmanagementApi.git
cd ProjectmanagementApi
```

### 2. Set the database connection string

This project uses .NET User Secrets to keep the connection string out of source code.
Run this from inside the `ProjectmanagementApi/` subfolder:

```bash
cd ProjectmanagementApi
dotnet user-secrets set "ConnectionStrings:DefaultConnection" "Server=localhost;Database=ProjectManagementV2;Trusted_Connection=True;TrustServerCertificate=True;"
```

> Adjust `Server=` to match your local SQL Server instance name if needed
> (e.g. `.\SQLEXPRESS` or `(localdb)\MSSQLLocalDB`).

### 3. Restore packages

```bash
dotnet restore
```

### 4. Create the database and tables

```bash
dotnet ef database update
```

This creates the `ProjectManagementV2` database and all 5 tables automatically.

### 5. Run the API

```bash
dotnet run
```

The API will start on:
- **HTTP:** `http://localhost:5241`
- **HTTPS:** `https://localhost:7034`

---

## API Endpoints

### Health
| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/health` | Check API and database connectivity |

### Users
| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/users` | List all users |
| GET | `/api/users/{id}` | Get a user by ID |

### Projects
| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/projects` | List all projects |
| GET | `/api/projects/{id}` | Get a project by ID |
| GET | `/api/projects/{id}/dashboard` | Project dashboard (Dapper + stored procedure) |
| POST | `/api/projects` | Create a new project |
| PUT | `/api/projects/{id}/status` | Update project status |
| DELETE | `/api/projects/{id}` | Delete a project |

### Tasks
| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/tasks?projectId={id}` | List tasks for a project |
| POST | `/api/tasks` | Create a new task |
| PUT | `/api/tasks/{id}/status` | Update task status |
| PUT | `/api/tasks/{id}/assign` | Assign a task to a user |
| DELETE | `/api/tasks/{id}` | Delete a task |

### GraphQL
| Endpoint | Description |
|---|---|
| `/graphql` | GraphQL endpoint (HotChocolate) |
| `/graphql-ui` | Banana Cake Pop GraphQL IDE |

### Swagger / OpenAPI
Available in Development mode at: `http://localhost:5241/swagger`

---

## Database Schema

Five tables managed by EF Core migrations:

```
Users
  └── Projects (OwnerId → Users.Id)
        └── ProjectMembers (ProjectId + UserId composite key)
        └── Tasks (ProjectId → Projects.Id)
              └── TaskComments (TaskId → Tasks.Id)
```

---

## Frontend

The React + Vite frontend is located in the `frontend/` folder.

```bash
cd frontend
npm install
npm run dev
```

Runs on `http://localhost:5173`. The backend CORS policy already allows this origin.

> **Note:** Material UI v6, Apollo Client, and TanStack Query integration are in progress (Week 3 deliverable).

---

## API Testing

A Postman collection is included at `postman/ProjectmanagementApi.postman_collection.json`.

It covers:
- Health check
- Full CRUD for Projects (self-cleaning — deletes test data after each run)

Import it into Postman and run the collection to verify all endpoints.

---

## Project Structure

```
ProjectmanagementApi/          ← Solution root
├── ProjectmanagementApi/      ← ASP.NET Core Web API
│   ├── Controllers/           ← REST API controllers
│   ├── GraphlQL/              ← HotChocolate GraphQL query
│   ├── migrations/            ← EF Core migration files
│   └── models/
│       ├── Entities.cs        ← Domain models (User, Project, Task, etc.)
│       └── Data/
│           └── AppDbContext.cs ← EF Core DbContext
├── frontend/                  ← React + Vite frontend (Week 3)
└── postman/                   ← Postman test collection
```

---

## GTP 2026 Programme Progress

| Week | Focus | Status |
|---|---|---|
| Week 1 | Environment setup, HackerRank challenges | ✅ Done |
| Week 2 | Backend API — REST, GraphQL, EF Core, Dapper | ✅ Done |
| Week 3 | Frontend — React, Material UI, Apollo, TanStack Query | 🔄 In Progress |
| Week 4 | Mobile — Flutter | ⏳ Upcoming |
| Week 5 | DevOps — Docker, CI/CD, Deployment | ⏳ Upcoming |
| Week 6–7 | Quality Engineering — Testing, Coverage, Jira | ⏳ Upcoming |

---

*Sababisha Solutions — GTP 2026 | We Make It Happen*
