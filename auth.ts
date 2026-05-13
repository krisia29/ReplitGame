import { Router } from "express";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";
import { RegisterBody, LoginBody } from "@workspace/api-zod";
import { requireAuth } from "../middlewares/auth";

const router = Router();

router.post("/auth/register", async (req, res) => {
  const parse = RegisterBody.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ error: "Invalid input", details: parse.error.issues });
    return;
  }
  const { username, email, password } = parse.data;

  const existing = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.email, email))
    .limit(1);

  if (existing.length > 0) {
    res.status(409).json({ error: "Email already registered" });
    return;
  }

  const existingUsername = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.username, username))
    .limit(1);

  if (existingUsername.length > 0) {
    res.status(409).json({ error: "Username already taken" });
    return;
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const avatarColors = ["#FF6B35", "#00D4FF", "#7B2FFF", "#00FF88", "#FF3366", "#FFD700"];
  const avatarColor = avatarColors[Math.floor(Math.random() * avatarColors.length)];

  const [user] = await db
    .insert(usersTable)
    .values({ username, email, passwordHash, avatarColor })
    .returning();

  const session = req.session as { userId?: number };
  session.userId = user.id;

  res.status(201).json({
    user: {
      id: user.id,
      username: user.username,
      email: user.email,
      points: user.points,
      level: user.level,
      avatarColor: user.avatarColor,
      createdAt: user.createdAt,
    },
  });
});

router.post("/auth/login", async (req, res) => {
  const parse = LoginBody.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ error: "Invalid input" });
    return;
  }
  const { email, password } = parse.data;

  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.email, email))
    .limit(1);

  if (!user) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  const session = req.session as { userId?: number };
  session.userId = user.id;

  res.json({
    user: {
      id: user.id,
      username: user.username,
      email: user.email,
      points: user.points,
      level: user.level,
      avatarColor: user.avatarColor,
      createdAt: user.createdAt,
    },
  });
});

router.post("/auth/logout", (req, res) => {
  req.session.destroy(() => {
    res.json({ message: "Logged out" });
  });
});

router.get("/auth/me", requireAuth, async (req, res) => {
  const session = req.session as { userId?: number };
  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, session.userId!))
    .limit(1);

  if (!user) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  res.json({
    id: user.id,
    username: user.username,
    email: user.email,
    points: user.points,
    level: user.level,
    avatarColor: user.avatarColor,
    createdAt: user.createdAt,
  });
});

export default router;
