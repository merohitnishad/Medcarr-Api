import express, { json, urlencoded, Request } from "express";
import authRoutes from "./routes/auth/index.js";
import userIndvidualRoutes from "./routes/user/individual/index.js";
import userOrganizationRoutes from "./routes/user/organization/index.js";
import userHealthCareRoutes from "./routes/user/healthcare/index.js";
import userCommonRoutes from "./routes/user/common/index.js";
import jobRoutes from "./routes/job/index.js";
import jobApplicationRoutes from "./routes/jobApplication/index.js";
import notificationRoutes from "./routes/notification/index.js";
import messageRoutes from "./routes/message/index.js";
import reviewRoutes from "./routes/review/index.js";
import disputeRoutes from "./routes/dispute/index.js";
import adminRoutes from "./routes/admin/index.js";
import cors from "cors";
import dotenv from "dotenv";
import SocketManager from "./routes/message/socketServer.js";
import { createServer } from "http";

// Load environment variables
dotenv.config();

const port = process.env.PORT || 4000;
const app = express();
const httpServer = createServer(app);

// Initialize Socket.io
const socketManager = new SocketManager(httpServer);

// Make socket manager available globally
declare global {
  var socketManager: SocketManager;
}
global.socketManager = socketManager;

// Enable CORS
app.use(
  cors({
    origin: ["http://localhost:3000", "https://test.medcarr.co.uk"],
    credentials: true,
  }),
);

app.use(urlencoded({ extended: true, limit: "2mb" }));
app.use(json({ limit: "2mb" }));

// Routes
app.use("/auth", authRoutes);
app.use("/user/individual", userIndvidualRoutes);
app.use("/user/organization", userOrganizationRoutes);
app.use("/user/healthcare", userHealthCareRoutes);
app.use("/user/common", userCommonRoutes);
app.use("/job", jobRoutes);
app.use("/jobApplication", jobApplicationRoutes);
app.use("/notification", notificationRoutes);
app.use("/message", messageRoutes);
app.use("/review", reviewRoutes);
app.use("/dispute", disputeRoutes);
app.use("/admin", adminRoutes);

// Health check endpoint
app.get("/health", (req, res) => {
  res.status(200).json({ status: "OK" });
});

// Start server
httpServer.listen(port, () => {
  console.log(`Server running on port ${port}`);
  console.log(`Socket.io server initialized`);
});
