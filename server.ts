import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import { RouterOSClient } from "routeros-client";
import dotenv from "dotenv";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // MikroTik API Helpers
  const getRouterClient = (config: any) => {
    return new RouterOSClient({
      host: config.host,
      user: config.user,
      password: config.password,
      port: config.port || 8728,
      timeout: 3000, // Reduced to 3s for faster failure feedback
    });
  };

  // API Routes
  app.post("/api/router/test", async (req, res) => {
    const { config } = req.body;
    const client = getRouterClient(config);
    try {
      await client.connect();
      await client.close();
      res.json({ success: true, message: "Connection successful" });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  });

  app.post("/api/router/hotspot/users", async (req, res) => {
    const { config } = req.body;
    try {
      const client = getRouterClient(config);
      const menu = await client.connect();
      const users = await menu.menu("/ip/hotspot/user").get();
      await client.close();
      res.json(users);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/router/hotspot/active", async (req, res) => {
    const { config } = req.body;
    try {
      const client = getRouterClient(config);
      const menu = await client.connect();
      const activeUsers = await menu.menu("/ip/hotspot/active").get();
      await client.close();
      res.json(activeUsers);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/router/hotspot/add-user", async (req, res) => {
    const { config, user } = req.body;
    try {
      const client = getRouterClient(config);
      const menu = await client.connect();
      await menu.menu("/ip/hotspot/user").add({
        name: user.name,
        password: user.password,
        profile: user.profile,
        comment: user.comment || "Created by MikroTik Manager",
      });
      await client.close();
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/router/resources", async (req, res) => {
    const { config } = req.body;
    try {
      const client = getRouterClient(config);
      const menu = await client.connect();
      const resources = await menu.menu("/system/resource").get();
      await client.close();
      res.json(resources[0]);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/router/userman/users", async (req, res) => {
    const { config } = req.body;
    try {
      const client = getRouterClient(config);
      const menu = await client.connect();
      const users = await menu.menu("/tool/user-manager/user").get();
      await client.close();
      res.json(users);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/router/userman/add-user", async (req, res) => {
    const { config, user } = req.body;
    try {
      const client = getRouterClient(config);
      const menu = await client.connect();
      // User Manager v6 syntax
      await menu.menu("/tool/user-manager/user").add({
        customer: user.customer || "admin",
        username: user.name,
        password: user.password,
        "copy-from": user.profile // In userman we often use copy-from or assign profile later
      });
      // Assign profile
      await menu.menu("/tool/user-manager/user/create-and-activate-profile").call({
        customer: user.customer || "admin",
        user: user.name,
        profile: user.profile
      });
      await client.close();
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
