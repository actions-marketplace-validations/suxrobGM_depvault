import { swagger } from "@elysiajs/swagger";
import { Elysia } from "elysia";

export const swaggerPlugin = new Elysia({ name: "swagger", prefix: "/api" }).use(
  swagger({
    documentation: {
      info: {
        title: "DepVault API",
        version: "1.0.0",
        description:
          "DepVault platform API for dependency analysis, vulnerability scanning, and encrypted secret management across any tech stack",
      },
      servers: [{ url: "http://localhost:4000", description: "Local development" }],
      tags: [
        { name: "Auth", description: "Registration, login, OAuth, token management" },
        { name: "Users", description: "User profile and account management" },
        { name: "Projects", description: "Project CRUD and team membership" },
        { name: "Analyses", description: "Dependency analysis and vulnerability scanning" },
        { name: "Files", description: "End-to-end encrypted repo files and version history" },
        { name: "Share Links", description: "One-time encrypted file sharing" },
        { name: "CI/CD Tokens", description: "CI/CD pipeline token management" },
        { name: "CI/CD Access", description: "CI/CD file retrieval" },
        { name: "Notifications", description: "User notification management" },
        { name: "Audit Log", description: "Project and global audit trail" },
        { name: "License Rules", description: "License compliance policy management" },
        { name: "Secret Scanning", description: "Git-aware secret detection" },
        { name: "GitHub", description: "GitHub repository integration" },
      ],
      components: {
        securitySchemes: {
          bearerAuth: {
            type: "http",
            scheme: "bearer",
            bearerFormat: "JWT",
            description:
              "JWT access token obtained from POST /api/auth/session or POST /api/auth/accounts",
          },
        },
      },
    },
  }),
);
