import { Router } from "express";
import { eq, desc } from "drizzle-orm";
import { db, feedItemsTable, usersTable, carsTable } from "@workspace/db";

const router = Router();

router.get("/community/feed", async (_req, res) => {
  const items = await db
    .select({
      id: feedItemsTable.id,
      type: feedItemsTable.type,
      userId: feedItemsTable.userId,
      description: feedItemsTable.description,
      carName: feedItemsTable.carName,
      points: feedItemsTable.points,
      createdAt: feedItemsTable.createdAt,
      username: usersTable.username,
    })
    .from(feedItemsTable)
    .innerJoin(usersTable, eq(feedItemsTable.userId, usersTable.id))
    .orderBy(desc(feedItemsTable.createdAt))
    .limit(30);

  res.json(items);
});

router.get("/community/players", async (_req, res) => {
  const users = await db
    .select({
      userId: usersTable.id,
      username: usersTable.username,
      level: usersTable.level,
      points: usersTable.points,
      avatarColor: usersTable.avatarColor,
    })
    .from(usersTable)
    .orderBy(desc(usersTable.points))
    .limit(20);

  // Get best car + wins for each user
  const bestCars = await db
    .select({
      userId: carsTable.userId,
      carName: carsTable.name,
      totalWins: carsTable.totalWins,
    })
    .from(carsTable)
    .orderBy(desc(carsTable.totalWins));

  const bestCarMap = new Map<number, { carName: string; totalWins: number }>();
  for (const car of bestCars) {
    if (!bestCarMap.has(car.userId)) {
      bestCarMap.set(car.userId, { carName: car.carName, totalWins: car.totalWins });
    }
  }

  res.json(
    users.map((u) => ({
      userId: u.userId,
      username: u.username,
      level: u.level,
      points: u.points,
      totalWins: bestCarMap.get(u.userId)?.totalWins ?? 0,
      avatarColor: u.avatarColor ?? null,
      bestCarName: bestCarMap.get(u.userId)?.carName ?? null,
    }))
  );
});

export default router;
